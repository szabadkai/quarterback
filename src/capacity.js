export const CapacityCalculator = {
  getWorkingDaysInQuarter() {
    return 65; // 13 weeks * 5 working days
  },

  calculateTheoretical(numEngineers, workingDays) {
    return numEngineers * workingDays;
  },

  calculateTimeOff(numEngineers, ptoPerPerson, companyHolidays) {
    return numEngineers * ptoPerPerson + companyHolidays;
  },

  calculateReserves(theoreticalCapacity, adhocPercent, bugPercent) {
    const adhoc = Math.round(theoreticalCapacity * (adhocPercent / 100));
    const bugs = Math.round(theoreticalCapacity * (bugPercent / 100));
    return adhoc + bugs;
  },

  calculateNetCapacity(theoretical, timeOff, reserves) {
    return Math.max(0, theoretical - timeOff - reserves);
  },

  buildLookup(records = []) {
    return new Map(records.map((record) => [record.id, record]));
  },

  calculateWithProfiles(config, workingDays, companyHolidays = []) {
    const regionLookup = this.buildLookup(config.regions);
    const roleLookup = this.buildLookup(config.roles);
    
    // Subtract company holidays from working days
    const holidayCount = Array.isArray(companyHolidays) ? companyHolidays.length : 0;
    const netWorkingDays = workingDays - holidayCount;

    return config.team.reduce(
      (acc, member) => {
        const role = roleLookup.get(member.roleId) || { focus: 100 };
        const region = regionLookup.get(member.regionId) || {};
        const focusMultiplier = Math.max(0, Math.min(role.focus ?? 100, 200)) / 100;
        const theoretical = Math.round(netWorkingDays * focusMultiplier);
        // Only subtract PTO days, holidays are already deducted from working days
        const timeOff = Math.round(region.ptoDays ?? config.ptoPerPerson ?? 0);
        const net = Math.max(0, theoretical - timeOff);

        acc.theoreticalCapacity += theoretical;
        acc.timeOffTotal += timeOff;
        acc.members.push({
          id: member.id,
          name: member.name,
          region: region.name || 'N/A',
          role: role.name || 'N/A',
          theoretical,
          timeOff,
          net,
        });
        return acc;
      },
      { theoreticalCapacity: 0, timeOffTotal: 0, members: [] },
    );
  },

  calculate(config, companyHolidays = []) {
    const workingDays = this.getWorkingDaysInQuarter(config.quarter);
    const hasProfiles = Array.isArray(config.team) && config.team.length > 0;
    let theoreticalCapacity = 0;
    let timeOffTotal = 0;
    let memberBreakdown = [];

    if (hasProfiles && config.regions?.length && config.roles?.length) {
      const profile = this.calculateWithProfiles(config, workingDays, companyHolidays);
      theoreticalCapacity = profile.theoreticalCapacity;
      timeOffTotal = profile.timeOffTotal;
      memberBreakdown = profile.members;
    } else {
      theoreticalCapacity = this.calculateTheoretical(config.numEngineers, workingDays);
      timeOffTotal = this.calculateTimeOff(
        config.numEngineers,
        config.ptoPerPerson,
        config.companyHolidays,
      );
    }

    const reserveTotal = this.calculateReserves(
      theoreticalCapacity,
      config.adhocReserve,
      config.bugReserve,
    );
    const netCapacity = this.calculateNetCapacity(
      theoreticalCapacity,
      timeOffTotal,
      reserveTotal,
    );

    return {
      theoreticalCapacity,
      timeOffTotal,
      reserveTotal,
      netCapacity,
      memberBreakdown,
      workingDays,
    };
  },

  calculateUtilization(committed, available) {
    if (!available) return 0;
    return Math.round((committed / available) * 100);
  },

  getUtilizationStatus(percentage) {
    if (percentage < 70) return 'low';
    if (percentage < 90) return 'good';
    if (percentage < 100) return 'high';
    return 'over';
  },
};
