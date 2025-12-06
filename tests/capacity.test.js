import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CapacityCalculator } from '../src/capacity.js';

test('reserves apply to theoretical capacity', () => {
  const base = 337;
  const reserve = CapacityCalculator.calculateReserves(base, 20, 10);
  assert.equal(reserve, base * 0.3);
});

test('simple mode calculation uses theoretical for reserves and subtracts time off', () => {
  const config = {
    numEngineers: 5,
    ptoPerPerson: 10, // annual
    adhocReserve: 20,
    bugReserve: 10,
    quarter: 'Q1-2024',
    team: [],
    regions: [],
    roles: [],
  };
  const holidays = ['2024-01-01', '2024-01-15']; // 2 company holidays
  const result = CapacityCalculator.calculate(config, holidays);

  // Working days for Q1-2024 should be stable; if it ever changes, adjust expected theoretical
  assert.equal(result.theoreticalCapacity, 325);
  assert.equal(result.timeOffTotal, 23); // PTO (10/4) + 2 holidays, per person
  assert.equal(result.reserveTotal, 98); // 30% of theoretical (rounded)
  assert.equal(result.netCapacity, 205); // 325 - 22.5 - 97.5 -> 205
});

test('profile mode combines role focus and region holidays before reserves', () => {
  const config = {
    numEngineers: 1,
    ptoPerPerson: 0, // ignored in profile mode
    adhocReserve: 10,
    bugReserve: 0,
    quarter: 'Q1-2024',
    team: [{ id: 1, name: 'Test', roleId: 1, regionId: 1 }],
    regions: [{ id: 1, name: 'US', ptoDays: 5, holidays: 2 }],
    roles: [{ id: 1, name: 'Manager', focus: 50 }],
  };
  const holidays = ['2024-01-01']; // company holidays
  const result = CapacityCalculator.calculate(config, holidays);

  assert.equal(result.theoreticalCapacity, 33); // 65 working days * 0.5 focus ≈ 32.5 -> round 33
  assert.equal(result.timeOffTotal, 3); // (5/4 PTO) + (2/4 regional) + 1 company ≈ 2.75 -> 3
  assert.equal(result.reserveTotal, 3); // 10% of theoretical
  assert.equal(result.netCapacity, 27); // ~26.5 -> 27
});

test('working days fallback when quarter missing or unparsable', () => {
  assert.equal(CapacityCalculator.getWorkingDaysInQuarter(''), 65);
  assert.equal(CapacityCalculator.getWorkingDaysInQuarter('bad'), 65);
});

test('utilization and status edge cases', () => {
  assert.equal(CapacityCalculator.calculateUtilization(10, 0), Infinity);
  assert.equal(CapacityCalculator.calculateUtilization(0, 0), null);
  assert.equal(CapacityCalculator.calculateUtilization(50, 25), 200);
  assert.equal(CapacityCalculator.getUtilizationStatus(null), 'none');
  assert.equal(CapacityCalculator.getUtilizationStatus(Infinity), 'over');
  assert.equal(CapacityCalculator.getUtilizationStatus(150), 'over');
  assert.equal(CapacityCalculator.getUtilizationStatus(50), 'low');
  assert.equal(CapacityCalculator.getUtilizationStatus(85), 'good');
  assert.equal(CapacityCalculator.getUtilizationStatus(95), 'high');
  assert.equal(CapacityCalculator.getUtilizationStatus(100), 'at-capacity');
});
