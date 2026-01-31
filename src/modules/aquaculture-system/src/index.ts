const farm = Farm.create({
  id: 'farm-001',
  name: 'Nile Valley Fish Farm',
  location: 'Alexandria, Egypt',
});

const tank1 = Tank.create({
  id: 'tank-001',
  name: 'Tank A1',
  volume: Volume.fromCubicMeters(50),
});

farm.addTank(tank1);
