import test from 'node:test';
import assert from 'node:assert/strict';
import { createLaneGraph, TrafficSimulation, trafficLightState } from '../src/city/traffic.js';

test('ambient lanes form a closed, tangent-continuous directed graph', () => {
  const graph = createLaneGraph();
  assert.equal(graph.segments.length, 8);
  assert.equal(graph.nodes.length, 8);
  const boundaries = graph.segments.map((segment) => segment.start);
  boundaries.push(graph.length);
  for (const boundary of boundaries) {
    const before = graph.sample(boundary - 1e-5);
    const after = graph.sample(boundary + 1e-5);
    assert.ok(Math.hypot(after.x - before.x, after.z - before.z) < 0.00003);
    assert.ok(Math.hypot(after.tx - before.tx, after.tz - before.tz) < 0.00002);
  }
  assert.deepEqual(graph.sample(0), graph.sample(graph.length));
  for (let s = 0; s < graph.length; s += 0.1) {
    const point = graph.sample(s);
    assert.ok(Math.abs(point.x) <= 24.051 && Math.abs(point.z) <= 8.051);
    assert.ok(Math.abs(Math.hypot(point.tx, point.tz) - 1) < 1e-10);
  }
});

test('traffic preserves front-to-back separation through queues and corners', () => {
  const simulation = new TrafficSimulation();
  let lowest = Infinity;
  for (let frame = 0; frame < 60 * 180; frame++) {
    simulation.update(1 / 60);
    lowest = Math.min(lowest, simulation.debug().minimumClearance);
    if (frame % 20 === 0) {
      const { vehicles } = simulation.debug();
      for (let first = 0; first < vehicles.length; first++) {
        for (let second = first + 1; second < vehicles.length; second++) {
          const a = vehicles[first];
          const b = vehicles[second];
          const radius = (entry) => Math.hypot(entry.length / 2, entry.kind === 'car' ? 0.50 : 0.23);
          assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > radius(a) + radius(b), 'Vehicle bounding circles intersected in a curve');
        }
      }
    }
  }
  assert.ok(lowest >= simulation.minimumGap - 1e-8, `Minimum clearance was ${lowest}`);
  assert.ok(simulation.vehicles.every((vehicle) => vehicle.distance > 100));
  assert.equal(simulation.vehicles.filter((vehicle) => vehicle.kind === 'motorcycle').length, 1);
});

test('vehicles brake for red lights and resume without crossing a red stop line', () => {
  const simulation = new TrafficSimulation();
  let witnessedStop = false;
  for (let frame = 0; frame < 60 * 65; frame++) {
    const before = simulation.debug();
    simulation.update(1 / 60);
    for (const vehicle of simulation.vehicles) {
      const previous = before.vehicles.find((entry) => entry.id === vehicle.id);
      for (const signal of before.signals) {
        if (signal.state !== 'red') continue;
        const previousDistance = ((signal.s - previous.s + simulation.graph.length) % simulation.graph.length) - previous.length / 2 - 0.08;
        if (previousDistance >= 0 && previousDistance < 3) {
          const traveled = vehicle.distance - previous.distance;
          assert.ok(traveled <= previousDistance + 1e-8);
          if (previousDistance < 0.4 && vehicle.speed < 0.1) witnessedStop = true;
        }
      }
    }
  }
  assert.ok(witnessedStop);
  assert.ok(simulation.vehicles.some((vehicle) => vehicle.distance > simulation.graph.length / 2));
  assert.equal(trafficLightState(5), 'green');
  assert.equal(trafficLightState(11), 'amber');
  assert.equal(trafficLightState(13), 'red');
});

test('traffic uses fixed steps and respects pause', () => {
  const fine = new TrafficSimulation();
  const coarse = new TrafficSimulation();
  for (let index = 0; index < 1800; index++) fine.update(1 / 60);
  for (let index = 0; index < 300; index++) coarse.update(0.1);
  fine.vehicles.forEach((vehicle, index) => {
    assert.ok(Math.abs(vehicle.s - coarse.vehicles[index].s) < 1e-8);
    assert.ok(Math.abs(vehicle.speed - coarse.vehicles[index].speed) < 1e-8);
  });
  const snapshot = coarse.debug();
  coarse.setEnabled(false);
  coarse.update(12);
  assert.equal(coarse.elapsed, snapshot.elapsed);
  assert.deepEqual(coarse.debug().vehicles, snapshot.vehicles);
  coarse.setEnabled(true);
  coarse.update(1);
  assert.ok(coarse.elapsed > snapshot.elapsed);
});
