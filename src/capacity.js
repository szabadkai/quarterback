export const CapacityCalculator = {
  /**
   * Calculate actual working days (weekdays) in a quarter
   * @param {string} quarterLabel - Quarter label like "Q1-2025"
   * @returns {number} Number of weekdays (Mon-Fri) in the quarter
   */
  getWorkingDaysInQuarter(quarterLabel) {
    if (!quarterLabel) {
      return 65; // Fallback for backward compatibility
    }

    // Parse quarter label (e.g., "Q1-2025")
    const match = quarterLabel.match(/Q(\d)-(\d{4})/);
    if (!match) {
      return 65; // Fallback if parsing fails
    }

    const quarterNumber = parseInt(match[1], 10);
    const year = parseInt(match[2], 10);

    // Calculate quarter date range
    const startMonth = (quarterNumber - 1) * 3;
    const quarterStart = new Date(year, startMonth, 1);
    const quarterEnd = new Date(year, startMonth + 3, 0); // Last day of quarter

    // Count weekdays (Mon-Fri)
    let workingDays = 0;
    const cursor = new Date(quarterStart);

    while (cursor <= quarterEnd) {
      const dayOfWeek = cursor.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not Sunday or Saturday
        workingDays++;
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    return workingDays;
  },

  calculateTheoretical(numEngineers, workingDays) {
    return numEngineers * workingDays;
  },

  /**
   * Calculate total time off for simple mode
   * @param {number} numEngineers - Number of engineers
   * @param {number} ptoPerPerson - PTO days per person
   * @param {Array} companyHolidays - Array of company holiday dates (not count!)
   * @returns {number} Total time off in person-days
   */
  calculateTimeOff(numEngineers, ptoPerPerson, companyHolidays) {
    const holidayCount = Array.isArray(companyHolidays) ? companyHolidays.length : 0;
    // Company holidays affect everyone, so multiply by team size
    return numEngineers * ptoPerPerson + (numEngineers * holidayCount);
  },

  /**
   * Calculate reserves (ad-hoc and bug work)
   * NOTE: Should be called with AVAILABLE capacity (after time off), not theoretical
   * @param {number} availableCapacity - Capacity after time off is subtracted
   * @param {number} adhocPercent - Percentage for ad-hoc work
   * @param {number} bugPercent - Percentage for bug fixes
   * @returns {number} Total reserve days (floating point to avoid rounding errors)
   */
  calculateReserves(availableCapacity, adhocPercent, bugPercent) {
    const adhoc = availableCapacity * (adhocPercent / 100);
    const bugs = availableCapacity * (bugPercent / 100);
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

    // Count company holidays (affects everyone equally)
    const companyHolidayCount = Array.isArray(companyHolidays) ? companyHolidays.length : 0;

    return config.team.reduce(
      (acc, member) => {
        const role = roleLookup.get(member.roleId) || { focus: 100 };
        const region = regionLookup.get(member.regionId) || {};
        const focusMultiplier = Math.max(0, Math.min(role.focus ?? 100, 200)) / 100;

        // Use floating point to avoid accumulating rounding errors
        const theoretical = workingDays * focusMultiplier;

        // Time off = PTO + company holidays + regional holidays (no rounding yet)
        const ptoDays = region.ptoDays ?? config.ptoPerPerson ?? 0;
        const regionalHolidays = region.holidays ?? 0;
        const timeOff = ptoDays + companyHolidayCount + regionalHolidays;

        const net = Math.max(0, theoretical - timeOff);

        acc.theoreticalCapacity += theoretical;
        acc.timeOffTotal += timeOff;
        acc.members.push({
          id: member.id,
          name: member.name,
          region: region.name || 'N/A',
          role: role.name || 'N/A',
          // Round only for display in member breakdown
          theoretical: Math.round(theoretical),
          timeOff: Math.round(timeOff),
          net: Math.round(net),
        });
        return acc;
      },
      { theoreticalCapacity: 0, timeOffTotal: 0, members: [] },
    );
  },

  /**
   * Calculate capacity using either simple mode or profile mode
   *
   * SIMPLE MODE (no team/regions/roles):
   *   - Theoretical = numEngineers × workingDays
   *   - Time Off = (numEngineers × PTO) + (numEngineers × companyHolidays)
   *   - Reserves = availableCapacity × (adhoc% + bug%)
   *   - Net = Theoretical - TimeOff - Reserves
   *
   * PROFILE MODE (with team/regions/roles):
   *   - Per member: Theoretical = workingDays × (roleFocus%)
   *   - Per member: TimeOff = regionPTO + companyHolidays + regionalHolidays
   *   - Per member: Net = Theoretical - TimeOff
   *   - Team: Reserves = totalAvailableCapacity × (adhoc% + bug%)
   *   - Team: Net = sum(memberNet) - Reserves
   *
   * CONSISTENCY: Both modes now handle holidays as arrays and apply reserves
   * to available capacity (after time off), not theoretical capacity.
   *
   * @param {Object} config - Configuration object
   * @param {Array<string>} companyHolidays - Array of ISO date strings for company holidays
   * @returns {Object} Capacity calculation results
   */
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
        companyHolidays, // Use array parameter, not config.companyHolidays
      );
    }

    // Calculate reserves on available capacity (after time off), not theoretical
    const availableCapacity = theoreticalCapacity - timeOffTotal;
    const reserveTotal = this.calculateReserves(
      availableCapacity,
      config.adhocReserve,
      config.bugReserve,
    );
    const netCapacity = this.calculateNetCapacity(
      availableCapacity,
      0, // timeOff already subtracted from available
      reserveTotal,
    );

    // Round only at the final output to minimize accumulated rounding errors
    return {
      theoreticalCapacity: Math.round(theoreticalCapacity),
      timeOffTotal: Math.round(timeOffTotal),
      reserveTotal: Math.round(reserveTotal),
      netCapacity: Math.round(netCapacity),
      memberBreakdown,
      workingDays,
    };
  },

  /**
   * Calculate utilization percentage
   * @param {number} committed - Committed capacity
   * @param {number} available - Available capacity
   * @returns {number|null} Utilization percentage, or null if no capacity available
   */
  calculateUtilization(committed, available) {
    // If no capacity available, return null to indicate undefined state
    if (!available || available <= 0) {
      return committed > 0 ? Infinity : null;
    }
    return Math.round((committed / available) * 100);
  },

  getUtilizationStatus(percentage) {
    if (percentage === null) return 'none';
    if (percentage === Infinity || percentage > 100) return 'over';
    if (percentage < 70) return 'low';
    if (percentage < 90) return 'good';
    if (percentage < 100) return 'high';
    return 'at-capacity';
  },
};
