import test from "node:test";
import assert from "node:assert/strict";
import { createDemoState } from "../src/city/model.js";
import {
  communicationsSummary,
  createDemoCommunicationActivities,
} from "../src/city/communications-model.js";

const byId = (state, id) =>
  communicationsSummary(state).find((place) => place.id === id);
const stateFor = (activities, extra = {}) => ({
  now: "2026-10-16T10:15:00+02:00",
  timeZone: "Europe/Madrid",
  activities,
  ...extra,
});

test("communication places count completed CRM records, not scheduled meetings", () => {
  const state = createDemoState();
  assert.equal(byId(state, "email").todayCompleted, 6);
  assert.equal(byId(state, "call").todayCompleted, 12);
  const cafe = byId(state, "meeting");
  assert.equal(cafe.todayCompleted, 1);
  assert.equal(cafe.pendingCount, 2);
  assert.equal(cafe.totalCount, 3);
  assert.equal(
    cafe.records.filter(
      (record) => Date.parse(record.occurredAt) > Date.parse(state.now),
    ).length,
    2,
  );
  const messages = byId(state, "messages");
  assert.equal(messages.channels.conversation.pendingCount, 9);
  assert.ok(
    messages.records.every(
      (record) =>
        record.channel !== "whatsapp" || record.source === "atlas-demo",
    ),
  );
});

test("unknown WhatsApp channel is unavailable; generic conversations do not become WhatsApps", () => {
  const state = stateFor([
    {
      id: "generic",
      type: "conversation",
      status: "done",
      occurredAt: "2026-10-16T09:00:00+02:00",
    },
  ]);
  const messages = byId(state, "messages");
  assert.equal(messages.sourceAvailable, true);
  assert.equal(messages.todayCompleted, 1);
  assert.equal(messages.channels.conversation.todayCompleted, 1);
  assert.equal(messages.channels.whatsapp.sourceAvailable, false);
  assert.equal(messages.channels.whatsapp.todayCompleted, null);
  assert.equal(messages.records[0].channel, "conversation");
});

test("a missing feed stays unknown, while an explicitly available empty channel is zero", () => {
  assert.ok(
    communicationsSummary({}).every(
      (place) =>
        place.sourceAvailable === false &&
        place.totalCount === null &&
        place.todayCompleted === null,
    ),
  );
  const empty = byId(
    stateFor([], { communicationCoverage: { channels: { whatsapp: true } } }),
    "messages",
  );
  assert.equal(empty.sourceAvailable, true);
  assert.equal(empty.channels.whatsapp.todayCompleted, 0);
  assert.equal(empty.channels.whatsapp.pendingCount, 0);
  assert.equal(empty.channels.conversation.totalCount, null);
});

test("completed today excludes invalid dates, future completions and pending activities", () => {
  const state = stateFor([
    {
      id: "actual",
      type: "email",
      status: "done",
      occurredAt: "2026-10-16T08:00:00+02:00",
    },
    {
      id: "future",
      type: "email",
      status: "completed",
      occurredAt: "2026-10-16T14:00:00+02:00",
    },
    {
      id: "scheduled",
      type: "email",
      status: "pending",
      occurredAt: "2026-10-16T09:00:00+02:00",
    },
    { id: "undated", type: "email", status: "done", occurredAt: null },
    { id: "invalid", type: "email", status: "done", occurredAt: "bad-date" },
    {
      id: "yesterday",
      type: "email",
      status: "done",
      occurredAt: "2026-10-15T23:00:00+02:00",
    },
  ]);
  assert.equal(byId(state, "email").todayCompleted, 1);
  assert.equal(byId(state, "email").pendingCount, 1);
  assert.equal(byId(state, "email").totalCount, 6);
  state.now = "unknown";
  assert.equal(byId(state, "email").todayCompleted, null);
});

test("today follows company timezone across UTC midnight and daylight saving", () => {
  const state = stateFor(
    [
      {
        id: "local-today",
        type: "meeting",
        status: "done",
        occurredAt: "2026-10-15T22:30:00Z",
      },
      {
        id: "local-yesterday",
        type: "meeting",
        status: "done",
        occurredAt: "2026-10-15T21:30:00Z",
      },
    ],
    { now: "2026-10-16T01:30:00+02:00" },
  );
  assert.equal(byId(state, "meeting").todayCompleted, 1);
  state.timeZone = "UTC";
  assert.equal(byId(state, "meeting").todayCompleted, 2);
  state.timeZone = "Europe/Madrid";
  state.now = "2026-10-25T02:45:00+01:00";
  state.activities = [
    {
      id: "early-hour",
      type: "call",
      status: "done",
      occurredAt: "2026-10-25T02:15:00+02:00",
    },
    {
      id: "late-hour",
      type: "call",
      status: "done",
      occurredAt: "2026-10-25T02:15:00+01:00",
    },
  ];
  assert.equal(byId(state, "call").todayCompleted, 2);
});

test("explicit completion time counts a rescheduled meeting without rewriting its scheduled date", () => {
  const state = stateFor([
    {
      id: "early-completion",
      type: "meeting",
      status: "done",
      occurredAt: "2026-10-16T15:00:00+02:00",
      completedAt: "2026-10-16T10:00:00+02:00",
    },
    {
      id: "future-without-completion",
      type: "meeting",
      status: "done",
      occurredAt: "2026-10-16T15:00:00+02:00",
    },
    {
      id: "future-completion",
      type: "meeting",
      status: "done",
      occurredAt: "2026-10-16T08:00:00+02:00",
      completedAt: "2026-10-16T16:00:00+02:00",
    },
    {
      id: "invalid-completion-fallback",
      type: "meeting",
      status: "done",
      occurredAt: "2026-10-16T09:00:00+02:00",
      completedAt: "invalid-date",
    },
  ]);
  const before = structuredClone(state);
  const cafe = byId(state, "meeting");
  assert.equal(cafe.todayCompleted, 2);
  const record = cafe.records.find(
    (activity) => activity.id === "early-completion",
  );
  assert.equal(record.occurredAt, "2026-10-16T15:00:00+02:00");
  assert.equal(record.completedAt, "2026-10-16T10:00:00+02:00");
  assert.deepEqual(state, before);
});

test("source IDs deduplicate deliveries and the last CRM version determines status", () => {
  const state = stateFor([
    {
      id: "email-1",
      type: "email",
      status: "pending",
      occurredAt: "2026-10-16T09:00:00+02:00",
    },
    {
      id: "email-1",
      type: "email",
      status: "done",
      occurredAt: "2026-10-16T10:00:00+02:00",
    },
    {
      id: "email-1",
      type: "email",
      status: "done",
      occurredAt: "2026-10-16T10:00:00+02:00",
    },
  ]);
  const before = structuredClone(state);
  const result = byId(state, "email");
  assert.equal(result.totalCount, 1);
  assert.equal(result.todayCompleted, 1);
  assert.equal(result.pendingCount, 0);
  assert.deepEqual(state, before);
});

test("record links retain source account and owner, with deal references as a fallback", () => {
  const state = stateFor(
    [
      {
        id: "linked",
        type: "call",
        status: "done",
        occurredAt: "2026-10-16T09:00:00+02:00",
        dealId: "deal-a",
      },
      {
        id: "explicit",
        type: "message",
        channel: "WhatsApp",
        status: "pending",
        accountId: "account-b",
        ownerId: "owner-c",
      },
    ],
    {
      deals: [{ id: "deal-a", ownerId: "owner-a", accountId: "account-a" }],
      accounts: [{ id: "account-b", ownerId: "owner-b" }],
    },
  );
  assert.equal(byId(state, "call").records[0].ownerId, "owner-a");
  assert.equal(byId(state, "call").records[0].accountId, "account-a");
  const whatsapp = byId(state, "messages");
  assert.equal(whatsapp.records[0].ownerId, "owner-c");
  assert.equal(whatsapp.channels.whatsapp.pendingCount, 1);
  assert.equal(whatsapp.channels.message.sourceAvailable, false);
});

test("explicit demo WhatsApps are deterministic, separately attributed, and never mutate the source", () => {
  const state = createDemoState();
  const initial = structuredClone(state);
  const demo = createDemoCommunicationActivities(state);
  assert.deepEqual(demo, createDemoCommunicationActivities(state));
  assert.equal(new Set(demo.map((activity) => activity.id)).size, 8);
  assert.ok(
    demo.every(
      (activity) =>
        activity.channel === "whatsapp" && activity.source === "atlas-demo",
    ),
  );
  assert.ok(
    demo.every(
      (activity) => Date.parse(activity.occurredAt) <= Date.parse(state.now),
    ),
  );
  assert.deepEqual(state, initial);
  // Appending the demo twice behaves like duplicated delivery from a connector.
  state.activities.push(...demo, ...demo);
  const whatsapp = byId(state, "messages").channels.whatsapp;
  assert.equal(whatsapp.totalCount, 8);
  assert.equal(whatsapp.todayCompleted, 6);
  assert.equal(whatsapp.pendingCount, 2);
  assert.equal(byId(state, "messages").channels.conversation.pendingCount, 9);
});
