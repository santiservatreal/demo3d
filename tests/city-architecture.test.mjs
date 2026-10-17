import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createArchitecture } from "../src/city/architecture.js";
import { createDemoState } from "../src/city/model.js";

function fixture() {
  const architecture = createArchitecture(new THREE.Scene()),
    state = createDemoState();
  state.deals.forEach((deal, variant) =>
    architecture.addEntity(
      { id: deal.id, amount: deal.amount, variant, accent: "#238bec" },
      new THREE.Vector3(variant * 4.2, 0.1, 0),
    ),
  );
  state.accounts.forEach((account, variant) =>
    architecture.addEntity(
      { id: account.id, client: true, variant, accent: "#3d9f88" },
      new THREE.Vector3(variant * 4.2, 0.1, -20),
    ),
  );
  architecture.build();
  return architecture;
}

function attributes(architecture) {
  return architecture.meshes.flatMap((mesh) => [
    mesh.instanceMatrix,
    mesh.instanceColor,
  ]);
}

function acknowledgeUpload(architecture) {
  // The real renderer invokes this after both initial bufferData allocation and
  // later uploads. No browser or GPU is needed to inspect pending upload ranges.
  for (const attribute of attributes(architecture))
    attribute.onUploadCallback();
}

function pendingIndices(attribute) {
  return attribute.updateRanges.flatMap(({ start, count }) =>
    Array.from(
      { length: count / attribute.itemSize },
      (_, offset) => start / attribute.itemSize + offset,
    ),
  );
}

function referencesFor(entity, mesh) {
  return entity.refs
    .filter((reference) => mesh.name === `city-kit-${reference.key}`)
    .map(({ index }) => index);
}

test("moving one building uploads only its matrices and preserves shared objects and picking IDs", () => {
  const architecture = fixture(),
    entity = architecture.entities.get("deal-001"),
    identity = architecture.meshes.map((mesh) => [
      mesh,
      mesh.geometry,
      mesh.material,
      mesh.instanceMatrix,
      mesh.instanceColor,
      mesh.instanceMatrix.array,
      mesh.instanceColor.array,
    ]),
    colors = architecture.meshes.map((mesh) =>
      mesh.instanceColor.array.slice(),
    ),
    groupId = entity.group.uuid;
  acknowledgeUpload(architecture);
  const colorVersions = architecture.meshes.map(
    (mesh) => mesh.instanceColor.version,
  );
  architecture.updateEntity(entity.id, {
    position: new THREE.Vector3(3, 0.1, -8),
  });
  let dirtyBytes = 0,
    previousFullUploadBytes = 0;
  for (let index = 0; index < architecture.meshes.length; index++) {
    const mesh = architecture.meshes[index],
      expected = referencesFor(entity, mesh);
    assert.deepEqual(pendingIndices(mesh.instanceMatrix), expected);
    assert.deepEqual(mesh.instanceColor.updateRanges, []);
    assert.equal(mesh.instanceColor.version, colorVersions[index]);
    assert.deepEqual(mesh.instanceColor.array, colors[index]);
    if (expected.length)
      previousFullUploadBytes +=
        mesh.instanceMatrix.array.byteLength +
        mesh.instanceColor.array.byteLength;
    dirtyBytes += mesh.instanceMatrix.updateRanges.reduce(
      (sum, range) => sum + range.count * Float32Array.BYTES_PER_ELEMENT,
      0,
    );
    for (const instanceId of expected)
      assert.equal(
        architecture.entityId({ object: mesh, instanceId }),
        entity.id,
      );
  }
  assert.equal(dirtyBytes, entity.refs.length * 16 * 4);
  assert.ok(
    dirtyBytes < previousFullUploadBytes * 0.01,
    `targeted ${dirtyBytes} bytes versus prior ${previousFullUploadBytes}`,
  );
  assert.equal(entity.group.uuid, groupId);
  architecture.meshes.forEach((mesh, index) => {
    const actual = [
      mesh,
      mesh.geometry,
      mesh.material,
      mesh.instanceMatrix,
      mesh.instanceColor,
      mesh.instanceMatrix.array,
      mesh.instanceColor.array,
    ];
    actual.forEach((object, part) => assert.equal(object, identity[index][part]));
  });
  architecture.dispose();
});

test("changing a stage accent uploads just that building's accent colors", () => {
  const architecture = fixture(),
    entity = architecture.entities.get("deal-009"),
    accent = new THREE.Color("#a259df");
  acknowledgeUpload(architecture);
  const matrixVersions = architecture.meshes.map(
    (mesh) => mesh.instanceMatrix.version,
  );
  architecture.updateEntity(entity.id, { accent: "#a259df" });
  for (let index = 0; index < architecture.meshes.length; index++) {
    const mesh = architecture.meshes[index],
      expected =
        mesh.name === "city-kit-accent" ? referencesFor(entity, mesh) : [];
    assert.deepEqual(pendingIndices(mesh.instanceColor), expected);
    assert.deepEqual(mesh.instanceMatrix.updateRanges, []);
    assert.equal(mesh.instanceMatrix.version, matrixVersions[index]);
    for (const instanceId of expected) {
      const actual = new THREE.Color();
      mesh.getColorAt(instanceId, actual);
      assert.ok(Math.abs(actual.r - accent.r) < 1e-6);
      assert.ok(Math.abs(actual.g - accent.g) < 1e-6);
      assert.ok(Math.abs(actual.b - accent.b) < 1e-6);
    }
  }
  architecture.dispose();
});

test("unchanged entity sync, equivalent colors and detail toggles schedule no uploads", () => {
  const architecture = fixture(),
    entity = architecture.entities.get("deal-001");
  acknowledgeUpload(architecture);
  const versions = attributes(architecture).map(
    (attribute) => attribute.version,
  );
  for (let index = 0; index < 50; index++) {
    architecture.updateEntity(entity.id, {
      position: entity.group.position.clone(),
      accent: new THREE.Color("#238bec"),
      visible: true,
      scaleY: 1,
      scaleXZ: 1,
      buildProgress: 1,
    });
    architecture.setDetail(index % 2 === 0);
  }
  assert.deepEqual(
    attributes(architecture).map((attribute) => attribute.version),
    versions,
  );
  for (const attribute of attributes(architecture))
    assert.deepEqual(attribute.updateRanges, []);
  architecture.dispose();
});

test("pending construction edits merge without growing ranges while rendering is paused", () => {
  const architecture = fixture(),
    entities = ["deal-001", "deal-031", "deal-016", "deal-002"].map((id) =>
      architecture.entities.get(id),
    );
  acknowledgeUpload(architecture);
  for (let frame = 0; frame < 400; frame++)
    for (const entity of entities)
      architecture.updateEntity(entity.id, {
        buildProgress: (frame % 100) / 100,
      });
  for (const mesh of architecture.meshes) {
    const expected = entities
      .flatMap((entity) => referencesFor(entity, mesh))
      .sort((a, b) => a - b);
    assert.deepEqual(pendingIndices(mesh.instanceMatrix), expected);
    assert.ok(mesh.instanceMatrix.updateRanges.length <= entities.length);
    assert.deepEqual(mesh.instanceColor.updateRanges, []);
  }
  acknowledgeUpload(architecture);
  architecture.updateEntity(entities[0].id, { buildProgress: 1 });
  for (const mesh of architecture.meshes)
    assert.deepEqual(
      pendingIndices(mesh.instanceMatrix),
      referencesFor(entities[0], mesh),
    );
  architecture.dispose();
});

test("new entities use reserved instance capacity without replacing buffers or picking references", () => {
  const architecture = fixture(),
    matrices = architecture.meshes.map((mesh) => mesh.instanceMatrix),
    colors = architecture.meshes.map((mesh) => mesh.instanceColor);
  acknowledgeUpload(architecture);
  const added = architecture.addEntity(
    { id: "deal-new", variant: 3, amount: 7500, accent: "#24b66b" },
    new THREE.Vector3(8, 0.1, 20),
  );
  for (let index = 0; index < architecture.meshes.length; index++) {
    const mesh = architecture.meshes[index],
      expected = referencesFor(added, mesh);
    assert.equal(mesh.instanceMatrix, matrices[index]);
    assert.equal(mesh.instanceColor, colors[index]);
    assert.deepEqual(pendingIndices(mesh.instanceMatrix), expected);
    assert.deepEqual(pendingIndices(mesh.instanceColor), expected);
    for (const instanceId of expected)
      assert.equal(
        architecture.entityId({ object: mesh, instanceId }),
        added.id,
      );
  }
  architecture.dispose();
});
