import test from "node:test";
import assert from "node:assert/strict";
import { createLandingMetric, formatLandingMetric, sampleLandingMetric } from "../src/landing/motion.js";

test("editorial metric targets reject malformed markup instead of producing an endless counter", () => {
  for (const target of [undefined, null, "", "   ", "not-a-number", NaN, Infinity, -Infinity]) {
    assert.equal(createLandingMetric({ target }), null);
  }
  assert.equal(createLandingMetric({ target: "942000" }).target, 942000);
  assert.equal(createLandingMetric({ target: 0 }).target, 0);
});

test("counter duration and precision remain bounded even if attributes are malformed", () => {
  const standard = createLandingMetric({ target: 46 });
  assert.equal(standard.duration, 1350);
  assert.equal(standard.decimals, 0);
  assert.equal(createLandingMetric({ target: 46, duration: "invalid" }).duration, standard.duration);
  assert.equal(createLandingMetric({ target: 46, duration: Infinity }).duration, standard.duration);
  assert.equal(createLandingMetric({ target: 46, duration: 999999 }).duration, 2400);
  assert.equal(createLandingMetric({ target: 46, duration: -30 }).duration, 0);
  assert.equal(createLandingMetric({ target: 46, decimals: "9" }).decimals, 3);
  assert.equal(createLandingMetric({ target: 46, decimals: -2 }).decimals, 0);
  assert.equal(createLandingMetric({ target: 46, format: "unexpected" }).format, "integer");
  assert.equal(Object.isFrozen(standard), true);
});

test("Spanish-format financial figures preserve units and precision from zero to the final amount", () => {
  const eur = createLandingMetric({ target: 942000, format: "eur" });
  const normalize = (value) => value.replace(/\s/g, " ");
  assert.equal(normalize(formatLandingMetric(0, eur)), "0 €");
  assert.equal(normalize(formatLandingMetric(942000, eur)), "942.000 €");
  assert.equal(normalize(formatLandingMetric(46, { format: "percent" })), "46 %");
  assert.equal(normalize(formatLandingMetric(942000.5, { format: "eur", decimals: 1 })), "942.000,5 €");
  assert.equal(formatLandingMetric(28), "28");
  assert.equal(formatLandingMetric(NaN), "0");
});

test("positive figures count monotonically without overshooting or losing their exact final value", () => {
  const metric = createLandingMetric({ target: 942000, duration: 1600 });
  const samples = Array.from({ length: 201 }, (_, index) => sampleLandingMetric(metric, index * 10));
  assert.equal(samples[0].value, 0);
  for (let index = 1; index < samples.length; index++) {
    assert.ok(samples[index].value >= samples[index - 1].value);
    assert.ok(samples[index].value <= metric.target);
  }
  assert.equal(samples[160].value, 942000);
  assert.equal(samples[160].complete, true);
  assert.deepEqual(samples.at(-1), samples[160]);
});

test("negative changes and fractional rates reach their targets without rounding the underlying data", () => {
  for (const target of [-12500, 46.75]) {
    const metric = createLandingMetric({ target, duration: 1000, decimals: 2 });
    const halfway = sampleLandingMetric(metric, 500);
    assert.ok(Math.abs(halfway.value) < Math.abs(target));
    assert.equal(Math.sign(halfway.value), Math.sign(target));
    assert.equal(sampleLandingMetric(metric, 1000).value, target);
  }
});

test("elapsed samples tolerate scrubbing and invalid input while zero-duration metrics complete immediately", () => {
  const metric = createLandingMetric({ target: 95, duration: 1000 });
  assert.deepEqual(sampleLandingMetric(metric, -100), { value: 0, progress: 0, complete: false });
  assert.deepEqual(sampleLandingMetric(metric, NaN), { value: 0, progress: 0, complete: false });
  assert.deepEqual(sampleLandingMetric(metric, Infinity), { value: 95, progress: 1, complete: true });
  const instant = createLandingMetric({ target: 95, duration: 0 });
  assert.deepEqual(sampleLandingMetric(instant, 0), { value: 95, progress: 1, complete: true });
});
