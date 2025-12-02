const BACKLOG_MIME = 'application/x-quarterback-project';
const BACKLOG_UNSCHEDULE_MIME = 'application/x-quarterback-unschedule';
const DAY_MS = 24 * 60 * 60 * 1000;
const SNAP_THRESHOLD_MS = 12 * 60 * 60 * 1000; // half-day tolerance

export const GanttChart = {
  weeks: [],
  projects: [],
  team: [],
  roles: [],
  regions: [],
  companyHolidays: [],
  currentQuarter: '',
  viewType: 'quarter',
  quarterStart: null,
  quarterEnd: null,
  quarterDuration: 0,
  currentDropHighlight: null,
  dragPreviewElement: null,
  scrollSyncSource: null,
  sidebarScrollHandler: null,
  timelineScrollHandler: null,

  update(projects = [], team = [], viewOptions = null) {
    this.projects = projects;
    this.team = team;
    let quarter = this.currentQuarter;
    let viewType = this.viewType || 'quarter';

    if (viewOptions && typeof viewOptions === 'object') {
      if (viewOptions.roles) this.roles = viewOptions.roles;
      if (viewOptions.regions) this.regions = viewOptions.regions;
      if (viewOptions.companyHolidays) this.companyHolidays = viewOptions.companyHolidays;
    }

    if (typeof viewOptions === 'string' && viewOptions) {
      quarter = viewOptions;
    } else if (viewOptions && typeof viewOptions === 'object') {
      if (viewOptions.quarter) quarter = viewOptions.quarter;
      if (viewOptions.viewType) viewType = viewOptions.viewType;
    }

    if (!quarter) {
      const now = new Date();
      const month = now.getMonth();
      const quarterIndex = Math.floor(month / 3) + 1;
      quarter = `Q${quarterIndex}-${now.getFullYear()}`;
    }

    this.currentQuarter = quarter;
    this.viewType = viewType;

    this.generateWeeks(this.currentQuarter, this.viewType);
    this.render();
  },

  generateWeeks(quarterLabel, viewType = 'quarter') {
    const quarterInfo = this.getQuarterRange(quarterLabel);
    const originalStart = new Date(quarterInfo.start);
    const originalEnd = new Date(quarterInfo.end);

    let rangeStart = new Date(originalStart);
    let rangeEnd = new Date(originalEnd);
    let weekLimit = 13;

    if (viewType === '2weeks') {
      weekLimit = 2;
      rangeEnd = new Date(rangeStart);
      rangeEnd.setDate(rangeEnd.getDate() + weekLimit * 7 - 1);
      if (rangeEnd > originalEnd) rangeEnd = new Date(originalEnd);
    } else if (viewType === '6weeks') {
      weekLimit = 6;
      rangeEnd = new Date(rangeStart);
      rangeEnd.setDate(rangeEnd.getDate() + weekLimit * 7 - 1);
      if (rangeEnd > originalEnd) rangeEnd = new Date(originalEnd);
    } else if (viewType === 'month') {
      weekLimit = 6; // enough to cover any month span
      const monthAnchor = this.getMonthAnchor(originalStart, originalEnd);
      rangeStart = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1);
      rangeEnd = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 0);
      if (rangeStart < originalStart) rangeStart = new Date(originalStart);
      if (rangeEnd > originalEnd) rangeEnd = new Date(originalEnd);
    }

    // Align to Monday - find the Monday on or before rangeStart
    const dayOfWeek = rangeStart.getDay();
    // dayOfWeek: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const alignedStart = new Date(rangeStart);
    alignedStart.setDate(alignedStart.getDate() + mondayOffset);

    const weeks = [];
    let cursor = new Date(alignedStart);
    let index = 0;
    while (cursor <= rangeEnd && index < weekLimit) {
      const weekStart = new Date(cursor);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6); // Mon-Sun
      
      // Only add weeks that overlap with the actual range
      if (weekEnd >= originalStart) {
        weeks.push({
          number: index + 1,
          start: new Date(weekStart),
          end: new Date(weekEnd),
          isCurrent: this.isCurrentWeek(weekStart, weekEnd),
        });
      }

      cursor.setDate(cursor.getDate() + 7);
      index += 1;
    }

    if (!weeks.length) {
      weeks.push({
        number: 1,
        start: new Date(rangeStart),
        end: new Date(rangeEnd),
        isCurrent: this.isCurrentWeek(rangeStart, rangeEnd),
      });
    }

    this.weeks = weeks;
    this.quarterStart = new Date(this.weeks[0].start);
    this.quarterEnd = new Date(this.weeks[this.weeks.length - 1].end);
    this.quarterDuration = Math.max(1, this.quarterEnd - this.quarterStart);
  },

  getMonthAnchor(rangeStart, rangeEnd) {
    const today = new Date();
    if (today >= rangeStart && today <= rangeEnd) {
      return today;
    }
    return rangeStart;
  },

  getQuarterRange(quarterLabel) {
    const [quarterPart, yearPart] = quarterLabel.split('-');
    const quarterNumber = parseInt(quarterPart.replace('Q', ''), 10);
    const year = parseInt(yearPart, 10);
    if (Number.isNaN(quarterNumber) || Number.isNaN(year)) {
      const today = new Date();
      const month = today.getMonth();
      const startMonth = Math.floor(month / 3) * 3;
      const fallbackStart = new Date(today.getFullYear(), startMonth, 1);
      const fallbackEnd = new Date(today.getFullYear(), startMonth + 3, 0);
      return { start: fallbackStart, end: fallbackEnd };
    }
    const startMonth = (quarterNumber - 1) * 3;
    const start = new Date(year, startMonth, 1);
    const end = new Date(year, startMonth + 3, 0);
    return { start, end };
  },

  isCurrentWeek(weekStart, weekEnd) {
    const today = new Date();
    return today >= weekStart && today <= weekEnd;
  },

  render() {
    const timeline = document.getElementById('ganttTimeline');

    if (!timeline) {
      return;
    }

    if (!this.team.length || !this.projects.length) {
      this.showEmpty();
      timeline.innerHTML = '';
      return;
    }

    this.hideEmpty();

    // Build unified table structure
    let html = '<div class="gantt-table">';
    
    // Header row with empty first cell for alignment + week headers
    html += '<div class="gantt-header-row">';
    html += '<div class="gantt-header-cell gantt-name-cell"></div>'; // Empty corner cell
    this.weeks.forEach((week) => {
      const dateRange = this.formatDateRange(week.start, week.end);
      const workingDaysInfo = this.getWeekWorkingDays(week.start, week.end);
      const weekdayDates = this.getWeekdayDates(week.start, week.end, workingDaysInfo.holidayDates);
      const classes = ['gantt-header-cell'];
      if (week.isCurrent) classes.push('current');
      if (workingDaysInfo.holidays > 0) classes.push('has-holidays');
      const label = this.viewType === 'month'
        ? week.start.toLocaleDateString('en-US', { month: 'short' })
        : `Week ${week.number}`;
      
      html += `<div class="${classes.join(' ')}" data-week="${week.number}" title="${workingDaysInfo.holidayNames.join(', ') || 'No holidays'}">
        <div>${label}</div>
        <div class="week-range">${dateRange}</div>
        <div class="weekday-dates">${weekdayDates}</div>
      </div>`;
    });
    html += '</div>';
    
    // Heatmap row
    html += this.renderCapacityHeatmapRow();
    
    // Team member rows
    this.team.forEach((member) => {
      html += this.renderTeamRow(member);
    });
    
    html += '</div>';
    
    timeline.innerHTML = html;

    this.renderProjects();
    this.attachProjectListeners();
    this.attachBacklogDropListeners();
    this.initDragToCreate();
  },

  renderCapacityHeatmapRow() {
    if (!this.team.length || !this.weeks.length) return '';
    
    let html = '<div class="gantt-heatmap-row">';
    html += '<div class="gantt-heatmap-label">Capacity</div>';
    
    this.weeks.forEach((week) => {
      const weekCapacity = this.calculateWeekCapacity(week.start, week.end);
      const weekLoad = this.calculateWeekLoad(week.start, week.end);
      const utilization = weekCapacity > 0 ? (weekLoad / weekCapacity) * 100 : 0;
      
      let heatClass = 'heat-low';
      if (utilization > 100) {
        heatClass = 'heat-over';
      } else if (utilization > 85) {
        heatClass = 'heat-high';
      } else if (utilization > 60) {
        heatClass = 'heat-medium';
      }
      
      const displayPercent = Math.round(utilization);
      html += `<div class="gantt-heatmap-cell ${heatClass}" title="${displayPercent}% capacity used (${weekLoad.toFixed(1)}/${weekCapacity.toFixed(1)} days)">
        ${displayPercent}%
      </div>`;
    });
    html += '</div>';
    return html;
  },

  // Calculate working days info for a week (for header display)
  getWeekWorkingDays(weekStart, weekEnd) {
    const companyHolidayMap = new Map(
      (this.companyHolidays || []).map(h => [h.date, h.name])
    );
    
    let workDays = 0;
    let holidays = 0;
    const holidayNames = [];
    const holidayDates = new Set();
    
    const cursor = new Date(weekStart);
    const endDate = new Date(weekEnd);
    
    while (cursor <= endDate) {
      const dayOfWeek = cursor.getDay();
      const dateStr = this.formatDateLocal(cursor);
      
      // Skip weekends
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        if (companyHolidayMap.has(dateStr)) {
          holidays += 1;
          holidayNames.push(companyHolidayMap.get(dateStr));
          holidayDates.add(dateStr);
        } else {
          workDays += 1;
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    
    return { workDays, holidays, holidayNames, holidayDates };
  },

  // Get weekday dates display (Mon-Fri) for a week
  // Weeks are now aligned to Monday, so just show dates 0-4 from weekStart
  getWeekdayDates(weekStart, weekEnd, holidayDates = new Set()) {
    const dates = [];
    const monday = new Date(weekStart);
    
    // Generate Mon-Fri dates (days 0-4 from Monday start)
    for (let i = 0; i < 5; i++) {
      const cursor = new Date(monday);
      cursor.setDate(monday.getDate() + i);
      const day = cursor.getDate();
      const dateStr = this.formatDateLocal(cursor);
      const isHoliday = holidayDates.has(dateStr);
      
      if (isHoliday) {
        dates.push(`<span class="weekday-date holiday">${day}</span>`);
      } else {
        dates.push(`<span class="weekday-date">${day}</span>`);
      }
    }
    
    return dates.join(' ');
  },

  // Calculate available team capacity for a given week
  // Helper to format date as YYYY-MM-DD in local timezone
  formatDateLocal(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  calculateWeekCapacity(weekStart, weekEnd) {
    const roleLookup = new Map((this.roles || []).map(r => [r.id, r]));
    const companyHolidaySet = new Set(
      (this.companyHolidays || []).map(h => h.date)
    );
    
    let totalCapacity = 0;
    
    this.team.forEach((member) => {
      // Get role focus percentage (default 100%)
      const role = roleLookup.get(member.roleId);
      const focusPercent = (role?.focus ?? 100) / 100;
      
      // Get member's PTO dates
      const ptoDates = new Set(member.ptoDates || []);
      
      // Count working days in this week for this member
      let workingDays = 0;
      const cursor = new Date(weekStart);
      const endDate = new Date(weekEnd);
      
      while (cursor <= endDate) {
        const dayOfWeek = cursor.getDay();
        const dateStr = this.formatDateLocal(cursor);
        
        // Skip weekends
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          // Skip company holidays
          if (!companyHolidaySet.has(dateStr)) {
            // Skip personal PTO
            if (!ptoDates.has(dateStr)) {
              workingDays += 1;
            }
          }
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      
      // Apply focus percentage
      totalCapacity += workingDays * focusPercent;
    });
    
    return totalCapacity;
  },

  renderTeamRow(member) {
    // Calculate this person's utilization and capacity details
    const capacityInfo = this.calculatePersonCapacityInfo(member);
    const utilizationClass = this.getUtilizationClass(capacityInfo.utilizationPercent);
    
    // SVG circular progress ring with multiple segments
    // Avatar is 36px, wrapper is 48px, so ring radius should be ~21 to wrap nicely
    const radius = 21;
    const circumference = 2 * Math.PI * radius;
    
    // Calculate ring segments:
    // Ring shows: Utilized (green-red gradient) | Unused Available (bg) | Blocked (muted stripe)
    // The ring is 100% of the circle, divided by:
    // - Available capacity = focusPercent% of the ring
    // - Blocked capacity = (100 - focusPercent)% of the ring
    // Within available, we fill utilizationPercent
    
    const focusPercent = capacityInfo.focusPercent; // e.g., 50% if role is 50% IC
    const blockedPercent = 100 - focusPercent; // e.g., 50% blocked for non-IC work
    const utilizedOfTotal = (Math.min(capacityInfo.utilizationPercent, 100) / 100) * focusPercent;
    
    // stroke-dashoffset = circumference - (percent/100 * circumference)
    // All segments start at top (-90deg rotation)
    const utilizedDashoffset = circumference - (utilizedOfTotal / 100) * circumference;
    const blockedDashoffset = circumference - (blockedPercent / 100) * circumference;
    
    // Blocked segment starts after the available capacity portion
    const blockedRotation = -90 + (focusPercent / 100) * 360;
    
    // Tooltip info
    const roleName = this.getRoleName(member.roleId);
    const focusLabel = focusPercent < 100 ? `${focusPercent}% IC focus` : 'Full-time IC';
    
    let html = `<div class="gantt-row" data-person-id="${member.id}">`;
    
    // Name cell (first column) with circular progress avatar
    html += `<div class="gantt-name-cell">
      <div class="person-avatar-wrapper ${utilizationClass}">
        <svg class="avatar-progress-ring" viewBox="0 0 48 48">
          <!-- Full background ring (always visible as base) -->
          <circle class="progress-ring-base" cx="24" cy="24" r="${radius}" />
          <!-- Available capacity arc (shown in lighter color) -->
          <circle class="progress-ring-bg" cx="24" cy="24" r="${radius}" 
            stroke-dasharray="${circumference}" 
            stroke-dashoffset="${circumference - (focusPercent / 100) * circumference}"
            transform="rotate(-90 24 24)" />
          <!-- Blocked capacity segment (non-IC work portion) -->
          ${blockedPercent > 0 ? `<circle class="progress-ring-blocked" cx="24" cy="24" r="${radius}" 
            stroke-dasharray="${circumference}" 
            stroke-dashoffset="${blockedDashoffset}"
            transform="rotate(${blockedRotation} 24 24)" />` : ''}
          <!-- Utilized capacity segment (starts at top) -->
          <circle class="progress-ring-fill ${utilizationClass}" cx="24" cy="24" r="${radius}" 
            stroke-dasharray="${circumference}" 
            stroke-dashoffset="${utilizedDashoffset}"
            transform="rotate(-90 24 24)" />
        </svg>
        <div class="person-avatar">${member.avatar}</div>
        <span class="person-name-tooltip">
          <strong>${member.name}</strong><br>
          <span class="tooltip-role">${roleName}</span><br>
          <span class="tooltip-focus">${focusLabel}</span><br>
          <span class="tooltip-percent ${utilizationClass}">${Math.round(capacityInfo.utilizationPercent)}% utilized</span>
        </span>
      </div>
    </div>`;
    
    // Timeline cells
    html += `<div class="gantt-timeline-cells" data-person-id="${member.id}">`;
    this.weeks.forEach((week, index) => {
      html += `<div class="gantt-cell" data-week-index="${index}" data-week-start="${week.start.toISOString()}" data-week-end="${week.end.toISOString()}"></div>`;
    });
    html += '</div>';
    
    html += '</div>';
    return html;
  },

  // Get role name by ID
  getRoleName(roleId) {
    const role = (this.roles || []).find(r => r.id === roleId);
    return role?.name || 'Team Member';
  },

  // Calculate detailed capacity info for a team member
  calculatePersonCapacityInfo(member) {
    const roleLookup = new Map((this.roles || []).map(r => [r.id, r]));
    const role = roleLookup.get(member.roleId);
    const focusPercent = role?.focus ?? 100;
    
    if (!this.weeks.length) {
      return { focusPercent, utilizationPercent: 0, capacity: 0, load: 0 };
    }
    
    const rangeStart = this.weeks[0].start;
    const rangeEnd = this.weeks[this.weeks.length - 1].end;
    
    const capacity = this.calculatePersonCapacity(member, rangeStart, rangeEnd);
    const load = this.calculatePersonLoad(member.id, rangeStart, rangeEnd);
    const utilizationPercent = capacity > 0 ? (load / capacity) * 100 : 0;
    
    return { focusPercent, utilizationPercent, capacity, load };
  },

  // Calculate utilization for a specific team member across visible weeks
  calculatePersonUtilization(member) {
    return this.calculatePersonCapacityInfo(member).utilizationPercent;
  },

  // Calculate capacity for a single person over a date range
  calculatePersonCapacity(member, rangeStart, rangeEnd) {
    const roleLookup = new Map((this.roles || []).map(r => [r.id, r]));
    const companyHolidaySet = new Set(
      (this.companyHolidays || []).map(h => h.date)
    );
    
    const role = roleLookup.get(member.roleId);
    const focusPercent = (role?.focus ?? 100) / 100;
    const ptoDates = new Set(member.ptoDates || []);
    
    let workingDays = 0;
    const cursor = new Date(rangeStart);
    const endDate = new Date(rangeEnd);
    
    while (cursor <= endDate) {
      const dayOfWeek = cursor.getDay();
      const dateStr = this.formatDateLocal(cursor);
      
      if (dayOfWeek !== 0 && dayOfWeek !== 6 && 
          !companyHolidaySet.has(dateStr) && 
          !ptoDates.has(dateStr)) {
        workingDays += 1;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    
    return workingDays * focusPercent;
  },

  // Calculate load for a single person over a date range
  calculatePersonLoad(memberId, rangeStart, rangeEnd) {
    let totalLoad = 0;
    const companyHolidaySet = new Set(
      (this.companyHolidays || []).map(h => h.date)
    );
    const memberLookup = new Map(this.team.map(m => [m.id, m]));
    
    this.projects.forEach((project) => {
      if (!project.startDate || !project.endDate) return;
      
      const assignees = Array.isArray(project.assignees) ? project.assignees : [];
      if (!assignees.includes(memberId) || !project.mandayEstimate) return;
      
      const projStart = new Date(project.startDate);
      const projEnd = new Date(project.endDate);
      const rangeStartDate = new Date(rangeStart);
      const rangeEndDate = new Date(rangeEnd);
      
      // Check if project overlaps with range
      if (projEnd < rangeStartDate || projStart > rangeEndDate) return;
      
      // Calculate working days for this project (raw days, not focus-adjusted)
      // Man-days are split equally among assignees, then distributed over project duration
      const numAssignees = assignees.length;
      const mandaysPerAssignee = project.mandayEstimate / numAssignees;
      
      // Count project duration working days (excluding weekends & holidays only)
      let projectWorkDays = 0;
      const projCursor = new Date(projStart);
      while (projCursor <= projEnd) {
        const dayOfWeek = projCursor.getDay();
        const dateStr = this.formatDateLocal(projCursor);
        if (dayOfWeek !== 0 && dayOfWeek !== 6 && !companyHolidaySet.has(dateStr)) {
          projectWorkDays += 1;
        }
        projCursor.setDate(projCursor.getDate() + 1);
      }
      
      if (projectWorkDays === 0) return;
      
      // Calculate overlap with visible range
      const overlapStart = projStart > rangeStartDate ? projStart : rangeStartDate;
      const overlapEnd = projEnd < rangeEndDate ? projEnd : rangeEndDate;
      
      // Get member's PTO in the overlap period
      const member = memberLookup.get(memberId);
      const ptoDates = new Set(member?.ptoDates || []);
      
      let overlapWorkDays = 0;
      const overlapCursor = new Date(overlapStart);
      while (overlapCursor <= overlapEnd) {
        const dayOfWeek = overlapCursor.getDay();
        const dateStr = this.formatDateLocal(overlapCursor);
        if (dayOfWeek !== 0 && dayOfWeek !== 6 && 
            !companyHolidaySet.has(dateStr) && 
            !ptoDates.has(dateStr)) {
          overlapWorkDays += 1;
        }
        overlapCursor.setDate(overlapCursor.getDate() + 1);
      }
      
      // Load = (man-days for this assignee / project duration) × overlap days
      // This gives us the man-days of work happening in the visible range
      const dailyLoad = mandaysPerAssignee / projectWorkDays;
      totalLoad += dailyLoad * overlapWorkDays;
    });
    
    return totalLoad;
  },

  // Get CSS class based on utilization percentage
  getUtilizationClass(utilization) {
    if (utilization > 100) return 'util-over';
    if (utilization > 85) return 'util-high';
    if (utilization > 60) return 'util-medium';
    if (utilization > 30) return 'util-low';
    return 'util-idle';
  },

  calculateWeekLoad(weekStart, weekEnd) {
    let totalDays = 0;
    const companyHolidaySet = new Set(
      (this.companyHolidays || []).map(h => h.date)
    );
    const memberLookup = new Map(this.team.map(m => [m.id, m]));
    
    this.projects.forEach((project) => {
      if (!project.startDate || !project.endDate) return;
      
      const projStart = new Date(project.startDate);
      const projEnd = new Date(project.endDate);
      const weekStartDate = new Date(weekStart);
      const weekEndDate = new Date(weekEnd);
      
      // Check if project overlaps with this week
      if (projEnd < weekStartDate || projStart > weekEndDate) return;
      
      const assignees = Array.isArray(project.assignees) ? project.assignees : [];
      if (assignees.length === 0 || !project.mandayEstimate) return;
      
      // Count project duration working days (raw, without focus adjustment)
      let projectWorkDays = 0;
      const projCursor = new Date(projStart);
      while (projCursor <= projEnd) {
        const dayOfWeek = projCursor.getDay();
        const dateStr = this.formatDateLocal(projCursor);
        if (dayOfWeek !== 0 && dayOfWeek !== 6 && !companyHolidaySet.has(dateStr)) {
          projectWorkDays += 1;
        }
        projCursor.setDate(projCursor.getDate() + 1);
      }
      
      if (projectWorkDays === 0) return;
      
      // Calculate overlap with this week for each assignee
      const overlapStart = projStart > weekStartDate ? projStart : weekStartDate;
      const overlapEnd = projEnd < weekEndDate ? projEnd : weekEndDate;
      
      // For each assignee, count their working days in the overlap (excluding PTO)
      let totalOverlapWorkDays = 0;
      assignees.forEach(assigneeId => {
        const member = memberLookup.get(assigneeId);
        if (!member) return;
        
        const ptoDates = new Set(member.ptoDates || []);
        let overlapDays = 0;
        const overlapCursor = new Date(overlapStart);
        while (overlapCursor <= overlapEnd) {
          const dayOfWeek = overlapCursor.getDay();
          const dateStr = this.formatDateLocal(overlapCursor);
          if (dayOfWeek !== 0 && dayOfWeek !== 6 && 
              !companyHolidaySet.has(dateStr) && 
              !ptoDates.has(dateStr)) {
            overlapDays += 1;
          }
          overlapCursor.setDate(overlapCursor.getDate() + 1);
        }
        totalOverlapWorkDays += overlapDays;
      });
      
      // Load = (man-days / project duration) × overlap days
      // This distributes the work proportionally across the project timeline
      const dailyLoad = project.mandayEstimate / projectWorkDays;
      const weekLoad = dailyLoad * (totalOverlapWorkDays / assignees.length);
      totalDays += weekLoad;
    });
    
    return Math.round(totalDays * 10) / 10; // Round to 1 decimal
  },

  // Count working days between two dates (inclusive, excluding weekends)
  countWorkingDays(start, end) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (startDate > endDate) return 0;
    
    let count = 0;
    const cursor = new Date(startDate);
    
    while (cursor <= endDate) {
      const dayOfWeek = cursor.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        count += 1;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    
    return count;
  },

  formatDateRange(start, end) {
    const options = { month: 'short', day: 'numeric' };
    return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}`;
  },

  // Drag to create state
  dragCreateState: null,

  initDragToCreate() {
    const timeline = document.getElementById('ganttTimeline');
    if (!timeline) return;

    timeline.addEventListener('mousedown', (e) => this.handleDragCreateStart(e));
    timeline.addEventListener('mousemove', (e) => this.handleDragCreateMove(e));
    timeline.addEventListener('mouseup', (e) => this.handleDragCreateEnd(e));
    timeline.addEventListener('mouseleave', () => this.cancelDragCreate());
  },

  handleDragCreateStart(e) {
    const cell = e.target.closest('.gantt-cell');
    const row = e.target.closest('.gantt-timeline-cells');
    if (!cell || !row) return;
    
    // Don't start drag-to-create if clicking on a project bar
    if (e.target.closest('.project-bar')) return;
    
    const personId = parseInt(row.dataset.personId, 10);
    const weekIndex = parseInt(cell.dataset.weekIndex, 10);
    const weekStart = cell.dataset.weekStart;
    
    if (isNaN(personId) || isNaN(weekIndex)) return;
    
    this.dragCreateState = {
      personId,
      startWeekIndex: weekIndex,
      endWeekIndex: weekIndex,
      startDate: new Date(weekStart),
      endDate: new Date(this.weeks[weekIndex].end),
      row
    };
    
    // Create preview element
    this.createDragPreview(row, weekIndex, weekIndex);
  },

  handleDragCreateMove(e) {
    if (!this.dragCreateState) return;
    
    const cell = e.target.closest('.gantt-cell');
    const row = e.target.closest('.gantt-timeline-cells');
    if (!cell || !row) return;
    
    // Only allow dragging within same row
    if (parseInt(row.dataset.personId, 10) !== this.dragCreateState.personId) return;
    
    const weekIndex = parseInt(cell.dataset.weekIndex, 10);
    if (isNaN(weekIndex)) return;
    
    this.dragCreateState.endWeekIndex = weekIndex;
    
    // Update preview
    const startIdx = Math.min(this.dragCreateState.startWeekIndex, weekIndex);
    const endIdx = Math.max(this.dragCreateState.startWeekIndex, weekIndex);
    this.updateDragPreview(startIdx, endIdx);
  },

  handleDragCreateEnd(e) {
    if (!this.dragCreateState) return;
    
    const { personId, startWeekIndex, endWeekIndex } = this.dragCreateState;
    const startIdx = Math.min(startWeekIndex, endWeekIndex);
    const endIdx = Math.max(startWeekIndex, endWeekIndex);
    
    const startDate = this.weeks[startIdx].start;
    const endDate = this.weeks[endIdx].end;
    
    this.removeDragPreview();
    this.dragCreateState = null;
    
    // Open project modal with pre-filled dates and assignee
    if (window.App && typeof window.App.openProjectModalWithDefaults === 'function') {
      window.App.openProjectModalWithDefaults({
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        assigneeId: personId
      });
    }
  },

  cancelDragCreate() {
    if (this.dragCreateState) {
      this.removeDragPreview();
      this.dragCreateState = null;
    }
  },

  createDragPreview(row, startIdx, endIdx) {
    const preview = document.createElement('div');
    preview.className = 'drag-create-preview';
    preview.id = 'dragCreatePreview';
    
    const left = startIdx * 120; // column width
    const width = (endIdx - startIdx + 1) * 120;
    
    preview.style.cssText = `left: ${left}px; width: ${width}px;`;
    preview.textContent = 'New Project';
    
    row.appendChild(preview);
  },

  updateDragPreview(startIdx, endIdx) {
    const preview = document.getElementById('dragCreatePreview');
    if (!preview) return;
    
    const left = startIdx * 120;
    const width = (endIdx - startIdx + 1) * 120;
    
    preview.style.left = `${left}px`;
    preview.style.width = `${width}px`;
  },

  removeDragPreview() {
    const preview = document.getElementById('dragCreatePreview');
    if (preview) preview.remove();
  },

  renderProjects() {
    this.projects.forEach((project) => {
      this.renderProject(project);
    });
  },

  syncScrollContainers() {
    const sidebar = document.getElementById('ganttSidebar');
    const timeline = document.getElementById('ganttTimeline');
    if (!sidebar || !timeline) return;

    if (this.sidebarScrollHandler) {
      sidebar.removeEventListener('scroll', this.sidebarScrollHandler);
    }
    if (this.timelineScrollHandler) {
      timeline.removeEventListener('scroll', this.timelineScrollHandler);
    }

    this.sidebarScrollHandler = () => {
      if (this.scrollSyncSource === 'timeline') return;
      this.scrollSyncSource = 'sidebar';
      timeline.scrollTop = sidebar.scrollTop;
      this.scrollSyncSource = null;
    };

    this.timelineScrollHandler = () => {
      if (this.scrollSyncSource === 'sidebar') return;
      this.scrollSyncSource = 'timeline';
      sidebar.scrollTop = timeline.scrollTop;
      this.scrollSyncSource = null;
    };

    sidebar.addEventListener('scroll', this.sidebarScrollHandler);
    timeline.addEventListener('scroll', this.timelineScrollHandler);
  },

  renderProject(project) {
    const assignees = Array.isArray(project.assignees)
      ? project.assignees
      : [project.assignees].filter(Boolean);

    assignees.forEach((assigneeId) => {
      const timelineCells = document.querySelector(
        `.gantt-timeline-cells[data-person-id="${assigneeId}"]`,
      );
      if (!timelineCells) return;
      const bar = this.createProjectBar(project);
      if (!bar) return;
      bar.dataset.assigneeId = assigneeId;
      timelineCells.appendChild(bar);
    });
  },

  createProjectBar(project) {
    const position = this.calculateBarPosition(project.startDate, project.endDate);
    if (!position) return null;

    const themeClass = this.getProjectTheme(project);
    const bar = document.createElement('div');
    bar.className = `project-bar ${project.status} confidence-${project.confidence} type-${themeClass}`;
    bar.dataset.projectId = project.id;
    bar.dataset.theme = themeClass;
    
    // Wrap text in a span for proper clipping
    const textSpan = document.createElement('span');
    textSpan.className = 'project-bar-text';
    textSpan.textContent = project.name;
    bar.appendChild(textSpan);
    
    bar.style.left = `${position.left}%`;
    bar.style.width = `${position.width}%`;
    bar.style.top = '12px';
    
    // Accessibility: make bar focusable and add ARIA attributes
    bar.setAttribute('tabindex', '0');
    bar.setAttribute('role', 'button');
    bar.setAttribute('aria-label', `Project: ${project.name}, Status: ${project.status}, Dates: ${project.startDate} to ${project.endDate}`);
    
    if (typeof project.iceScore === 'number') {
      const formatted = project.iceScore % 1 === 0 ? project.iceScore.toFixed(0) : project.iceScore.toFixed(1);
      bar.title = `${project.name} • ICE ${formatted}`;
      bar.dataset.iceScore = formatted;
    } else {
      bar.title = project.name;
    }

    const resizeStart = document.createElement('div');
    resizeStart.className = 'project-bar-resize start';
    resizeStart.setAttribute('aria-hidden', 'true');
    bar.appendChild(resizeStart);

    const resizeEnd = document.createElement('div');
    resizeEnd.className = 'project-bar-resize end';
    resizeEnd.setAttribute('aria-hidden', 'true');
    bar.appendChild(resizeEnd);

    const ripcord = document.createElement('button');
    ripcord.className = 'project-bar-ripcord';
    ripcord.type = 'button';
    ripcord.setAttribute('aria-label', 'Send project back to backlog');
    ripcord.setAttribute('draggable', 'true');
    ripcord.title = 'Drag back to backlog';
    ripcord.textContent = '↩';
    bar.appendChild(ripcord);

    return bar;
  },

  calculateBarPosition(startDate, endDate) {
    if (!this.weeks.length) return null;
    const quarterStart = this.weeks[0].start;
    const quarterEnd = this.weeks[this.weeks.length - 1].end;
    const totalDuration = quarterEnd - quarterStart;
    if (totalDuration <= 0) return null;

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return null;
    }

    if (end < quarterStart || start > quarterEnd) {
      return null;
    }

    const clampedStart = start < quarterStart ? quarterStart : start;
    const clampedEnd = end > quarterEnd ? quarterEnd : end;
    const left = ((clampedStart - quarterStart) / totalDuration) * 100;
    const width = Math.max(2, ((clampedEnd - clampedStart) / totalDuration) * 100);

    return {
      left: Math.max(0, Math.min(100, left)),
      width: Math.max(0, Math.min(100, width)),
    };
  },

  attachProjectListeners() {
    const bars = document.querySelectorAll('.project-bar');
    if (!bars.length) return;

    bars.forEach((bar) => {
      const projectId = parseInt(bar.dataset.projectId, 10);
      const startHandle = bar.querySelector('.project-bar-resize.start');
      const endHandle = bar.querySelector('.project-bar-resize.end');
      const ripcord = bar.querySelector('.project-bar-ripcord');

      bar.addEventListener('click', (event) => {
        if (bar.dataset.suppressClick === 'true') {
          event.stopPropagation();
          return;
        }
        if (event.target.closest('.project-bar-resize')) {
          event.stopPropagation();
          return;
        }
        // Select the project for keyboard navigation
        if (window.App && typeof window.App.selectProject === 'function') {
          window.App.selectProject(projectId);
        }
        this.editProject(projectId);
      });

      bar.addEventListener('mousedown', (event) => {
        if (event.target.closest('.project-bar-resize')) return;
        // Select on mousedown for immediate feedback
        if (window.App && typeof window.App.selectProject === 'function') {
          window.App.selectProject(projectId);
        }
        this.initDrag(event, bar, projectId);
      });

      startHandle?.addEventListener('mousedown', (event) => {
        this.initResize(event, bar, projectId, 'start');
      });

      endHandle?.addEventListener('mousedown', (event) => {
        this.initResize(event, bar, projectId, 'end');
      });

      if (ripcord) {
        ripcord.addEventListener('mousedown', (event) => {
          event.stopPropagation();
        });
        ripcord.addEventListener('click', (event) => {
          event.stopPropagation();
          this.unscheduleProject(projectId);
        });
        ripcord.addEventListener('dragstart', (event) => {
          this.handleRipcordDragStart(event, projectId, bar);
        });
        ripcord.addEventListener('dragend', (event) => {
          this.handleRipcordDragEnd(event, bar);
        });
      }
    });
  },

  handleRipcordDragStart(event, projectId, bar) {
    event.stopPropagation();
    if (!event.dataTransfer) return;
    event.dataTransfer.setData(BACKLOG_MIME, projectId);
    event.dataTransfer.setData(BACKLOG_UNSCHEDULE_MIME, projectId);
    event.dataTransfer.effectAllowed = 'move';
    bar.classList.add('ghosting');
    const preview = this.createDragPreview(bar);
    if (preview) {
      event.dataTransfer.setDragImage(preview.node, preview.width / 2, preview.height / 2);
    }
    this.clearBacklogDockHighlight();
  },

  handleRipcordDragEnd(event, bar) {
    event.stopPropagation();
    bar.classList.remove('ghosting');
    this.clearBacklogDockHighlight();
    this.removeDragPreview();
  },

  attachBacklogDropListeners() {
    const rows = document.querySelectorAll('.gantt-timeline-cells');
    if (!rows.length) return;
    rows.forEach((row) => {
      row.addEventListener('dragover', (event) => this.handleBacklogDragOver(event, row));
      row.addEventListener('dragleave', () => this.clearRowDropHighlight(row));
      row.addEventListener('drop', (event) => this.handleBacklogDrop(event, row));
    });
  },

  isBacklogDrag(event) {
    return Array.from(event.dataTransfer.types || []).includes(BACKLOG_MIME);
  },

  handleBacklogDragOver(event, row) {
    if (!this.isBacklogDrag(event)) return;
    event.preventDefault();
    row.classList.add('drop-target');
    event.dataTransfer.dropEffect = 'copy';
  },

  clearRowDropHighlight(row) {
    row.classList.remove('drop-target');
  },

  handleBacklogDrop(event, row) {
    if (!this.isBacklogDrag(event)) return;
    event.preventDefault();
    this.clearRowDropHighlight(row);
    const projectId = parseInt(event.dataTransfer.getData(BACKLOG_MIME), 10);
    if (!Number.isInteger(projectId)) return;
    const ganttRow = row.closest('.gantt-row');
    if (!ganttRow) return;
    const assigneeId = parseInt(ganttRow.dataset.personId, 10);
    if (!Number.isInteger(assigneeId)) return;
    const dropDate = this.getDropDateFromEvent(row, event.clientX);
    if (!dropDate) return;
    if (window.App && typeof window.App.placeBacklogProject === 'function') {
      window.App.placeBacklogProject(projectId, assigneeId, dropDate);
    }
  },

  createDragPreview(element) {
    if (!element || typeof element.cloneNode !== 'function') return null;
    this.removeDragPreview();
    const rect = element.getBoundingClientRect();
    const width = rect.width || element.offsetWidth || 0;
    const height = rect.height || element.offsetHeight || 0;
    const clone = element.cloneNode(true);
    clone.classList.add('drag-preview');
    clone.style.width = `${width}px`;
    clone.style.height = `${height}px`;
    document.body.appendChild(clone);
    this.dragPreviewElement = clone;
    return { node: clone, width, height };
  },

  removeDragPreview() {
    if (this.dragPreviewElement?.parentNode) {
      this.dragPreviewElement.parentNode.removeChild(this.dragPreviewElement);
    }
    this.dragPreviewElement = null;
  },

  isPointerOverBacklogDock(clientX, clientY) {
    const dock = document.getElementById('backlogDock');
    if (!dock) return false;
    const rect = dock.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  },

  highlightBacklogDock() {
    const dock = document.getElementById('backlogDock');
    dock?.classList.add('drop-target');
  },

  clearBacklogDockHighlight() {
    const dock = document.getElementById('backlogDock');
    dock?.classList.remove('drop-target');
  },

  unscheduleProject(projectId) {
    if (window.App && typeof window.App.sendProjectToBacklog === 'function') {
      window.App.sendProjectToBacklog(projectId);
    }
  },

  getDropDateFromEvent(row, clientX) {
    if (!this.quarterStart || !this.quarterEnd) return null;
    const rect = row.getBoundingClientRect();
    const clampedX = Math.max(rect.left, Math.min(clientX, rect.right));
    const ratio = rect.width ? (clampedX - rect.left) / rect.width : 0;
    const duration = this.quarterEnd - this.quarterStart;
    const targetMs = this.quarterStart.getTime() + ratio * duration;
    return new Date(targetMs);
  },

  editProject(projectId) {
    if (window.App && typeof window.App.openProjectModal === 'function') {
      const project = this.projects.find((p) => p.id === projectId);
      if (project) {
        window.App.openProjectModal(project);
      }
    }
  },

  showEmpty() {
    const emptyState = document.getElementById('emptyState');
    const ganttContainer = document.getElementById('ganttContainer');
    if (emptyState) emptyState.classList.remove('hidden');
    if (ganttContainer) ganttContainer.style.display = 'none';
  },

  hideEmpty() {
    const emptyState = document.getElementById('emptyState');
    const ganttContainer = document.getElementById('ganttContainer');
    if (emptyState) emptyState.classList.add('hidden');
    if (ganttContainer) ganttContainer.style.display = 'flex';
  },

  initDrag(event, bar, projectId) {
    if (event.button !== 0 || !this.quarterDuration) return;
    const project = this.projects.find((p) => p.id === projectId);
    if (!project) return;
    const metrics = this.getTimelineMetrics(bar);
    if (!metrics) return;

    const DRAG_THRESHOLD = 5; // pixels before drag starts
    const startX = event.clientX;
    const startY = event.clientY;
    let dragStarted = false;

    const state = {
      startX: event.clientX,
      startDate: new Date(project.startDate),
      endDate: new Date(project.endDate),
      durationMs: this.quarterDuration,
      width: metrics.width,
      assigneeId: parseInt(bar.dataset.assigneeId, 10) || null,
      dropTargetId: parseInt(bar.dataset.assigneeId, 10) || null,
      overBacklogDock: false,
      originalParent: bar.parentElement,
    };
    if (Number.isNaN(state.startDate.getTime()) || Number.isNaN(state.endDate.getTime())) return;

    let pending = null;
    let moved = false;
    let timelineChanged = false;

    const onMouseMove = (moveEvent) => {
      // Check if we've moved enough to start dragging
      if (!dragStarted) {
        const dx = Math.abs(moveEvent.clientX - startX);
        const dy = Math.abs(moveEvent.clientY - startY);
        if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) {
          return; // Not enough movement yet
        }
        // Start the drag
        dragStarted = true;
        bar.classList.add('dragging');
        this.showTimelineTooltip(bar, state.startDate, state.endDate);
      }

      moved = true;
      const deltaPx = moveEvent.clientX - state.startX;
      const deltaMs = (deltaPx / state.width) * state.durationMs;
      let nextStart = new Date(state.startDate.getTime() + deltaMs);
      let nextEnd = new Date(state.endDate.getTime() + deltaMs);
      ({ start: nextStart, end: nextEnd } = this.clampDragDates(nextStart, nextEnd));

      const pointerLaneId = this.getDropTargetId(moveEvent.clientX, moveEvent.clientY);
      const overDock = this.isPointerOverBacklogDock(moveEvent.clientX, moveEvent.clientY);
      const activeLaneForSnap = overDock ? null : (pointerLaneId || state.dropTargetId || state.assigneeId);

      ({ start: nextStart, end: nextEnd } = this.snapRange(nextStart, nextEnd, {
        mode: 'drag',
        excludeProjectId: projectId,
        assigneeId: activeLaneForSnap,
      }));
      ({ start: nextStart, end: nextEnd } = this.clampDragDates(nextStart, nextEnd));

      this.previewBar(bar, nextStart, nextEnd);
      this.showTimelineTooltip(bar, nextStart, nextEnd);
      pending = { start: nextStart, end: nextEnd };
      timelineChanged =
        nextStart.getTime() !== state.startDate.getTime()
        || nextEnd.getTime() !== state.endDate.getTime();

      if (overDock) {
        if (!state.overBacklogDock) {
          this.highlightBacklogDock();
        }
        state.overBacklogDock = true;
        state.dropTargetId = state.assigneeId;
        this.clearDropTargetHighlight();
        // Move bar back to original lane when over dock
        if (bar.parentElement !== state.originalParent && state.originalParent) {
          state.originalParent.appendChild(bar);
        }
      } else {
        if (state.overBacklogDock) {
          this.clearBacklogDockHighlight();
        }
        state.overBacklogDock = false;
        if (pointerLaneId) {
          state.dropTargetId = pointerLaneId;
          this.highlightDropTarget(pointerLaneId);
          // Move bar to target lane so it's visible during drag
          const targetRow = document.querySelector(
            `.gantt-timeline-cells[data-person-id="${pointerLaneId}"]`
          );
          if (targetRow && bar.parentElement !== targetRow) {
            targetRow.appendChild(bar);
          }
        } else {
          state.dropTargetId = state.assigneeId;
          this.clearDropTargetHighlight();
        }
      }
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      bar.classList.remove('dragging');
      this.hideTimelineTooltip();
      
      // If drag never started (just a click), let the click event handle it
      if (!dragStarted) {
        return;
      }
      
      if (state.overBacklogDock) {
        this.clearBacklogDockHighlight();
        this.clearDropTargetHighlight();
        bar.dataset.suppressClick = 'true';
        this.unscheduleProject(projectId);
        requestAnimationFrame(() => {
          bar.dataset.suppressClick = 'false';
        });
        return;
      }
      this.clearDropTargetHighlight();
      const assignmentChanged = state.dropTargetId
        && state.assigneeId
        && state.dropTargetId !== state.assigneeId;
      if ((moved && pending && timelineChanged) || assignmentChanged) {
        bar.dataset.suppressClick = 'true';
        const startForCommit = timelineChanged && pending ? pending.start : null;
        const endForCommit = timelineChanged && pending ? pending.end : null;
        this.commitProjectUpdate(
          projectId,
          startForCommit,
          endForCommit,
          assignmentChanged
            ? { from: state.assigneeId, to: state.dropTargetId }
            : null,
        );
        requestAnimationFrame(() => {
          bar.dataset.suppressClick = 'false';
        });
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  },

  initResize(event, bar, projectId, edge) {
    if (event.button !== 0 || !this.quarterDuration) return;
    event.preventDefault();
    event.stopPropagation();
    const project = this.projects.find((p) => p.id === projectId);
    if (!project) return;
    const metrics = this.getTimelineMetrics(bar);
    if (!metrics) return;

    const state = {
      startX: event.clientX,
      startDate: new Date(project.startDate),
      endDate: new Date(project.endDate),
      durationMs: this.quarterDuration,
      width: metrics.width,
      assigneeId: parseInt(bar.dataset.assigneeId, 10) || null,
    };
    if (Number.isNaN(state.startDate.getTime()) || Number.isNaN(state.endDate.getTime())) return;

    let pending = null;
    let moved = false;
    this.showTimelineTooltip(bar, state.startDate, state.endDate);

    const onMouseMove = (moveEvent) => {
      moved = true;
      const deltaPx = moveEvent.clientX - state.startX;
      const deltaMs = (deltaPx / state.width) * state.durationMs;
      let nextStart = new Date(state.startDate);
      let nextEnd = new Date(state.endDate);

      if (edge === 'start') {
        nextStart = this.clampResizeStart(new Date(state.startDate.getTime() + deltaMs), nextEnd);
      } else {
        nextEnd = this.clampResizeEnd(nextStart, new Date(state.endDate.getTime() + deltaMs));
      }

      ({ start: nextStart, end: nextEnd } = this.snapRange(nextStart, nextEnd, {
        mode: edge === 'start' ? 'resize-start' : 'resize-end',
        excludeProjectId: projectId,
        assigneeId: state.assigneeId,
      }));

      if (edge === 'start') {
        nextStart = this.clampResizeStart(nextStart, nextEnd);
      } else {
        nextEnd = this.clampResizeEnd(nextStart, nextEnd);
      }

      this.previewBar(bar, nextStart, nextEnd);
      this.showTimelineTooltip(bar, nextStart, nextEnd);
      pending = { start: nextStart, end: nextEnd };
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      this.hideTimelineTooltip();
      if (moved && pending) {
        bar.dataset.suppressClick = 'true';
        this.commitProjectUpdate(projectId, pending.start, pending.end);
        requestAnimationFrame(() => {
          bar.dataset.suppressClick = 'false';
        });
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  },

  previewBar(bar, start, end) {
    const position = this.calculateBarPosition(start, end);
    if (!position) {
      this.hideTimelineTooltip();
      return;
    }
    bar.style.left = `${position.left}%`;
    bar.style.width = `${position.width}%`;
  },

  clampDragDates(start, end) {
    if (!this.quarterStart || !this.quarterEnd) return { start, end };
    const minDuration = this.getMinDuration();
    const span = Math.max(minDuration, this.quarterEnd - this.quarterStart);
    const duration = Math.min(Math.max(minDuration, end - start), span);
    let clampedStart = new Date(start);
    let clampedEnd = new Date(end);

    if (clampedStart < this.quarterStart) {
      clampedStart = new Date(this.quarterStart);
      clampedEnd = new Date(clampedStart.getTime() + duration);
    }

    if (clampedEnd > this.quarterEnd) {
      clampedEnd = new Date(this.quarterEnd);
      clampedStart = new Date(clampedEnd.getTime() - duration);
    }

    if (clampedEnd - clampedStart < minDuration) {
      clampedEnd = new Date(clampedStart.getTime() + minDuration);
    }

    return { start: clampedStart, end: clampedEnd };
  },

  clampResizeStart(candidate, fixedEnd) {
    if (!this.quarterStart || !this.quarterEnd) return candidate;
    const availableWindow = fixedEnd.getTime() - this.quarterStart.getTime();
    const minDuration = this.getMinDuration(availableWindow);
    const minStartTime = this.quarterStart.getTime();
    const maxStartTime = Math.min(this.quarterEnd.getTime() - minDuration, fixedEnd.getTime() - minDuration);
    let targetTime = candidate.getTime();
    if (Number.isNaN(targetTime)) targetTime = minStartTime;
    targetTime = Math.max(minStartTime, Math.min(targetTime, maxStartTime));
    return new Date(targetTime);
  },

  clampResizeEnd(fixedStart, candidate) {
    if (!this.quarterStart || !this.quarterEnd) return candidate;
    const effectiveStart = Math.max(fixedStart.getTime(), this.quarterStart.getTime());
    const availableWindow = this.quarterEnd.getTime() - effectiveStart;
    const minDuration = this.getMinDuration(availableWindow);
    const minEndTime = effectiveStart + minDuration;
    const maxEndTime = this.quarterEnd.getTime();
    let targetTime = candidate.getTime();
    if (Number.isNaN(targetTime)) targetTime = minEndTime;
    targetTime = Math.min(maxEndTime, Math.max(targetTime, minEndTime));
    return new Date(targetTime);
  },

  getDropTargetId(x, y) {
    const element = document.elementFromPoint(x, y);
    if (!element) return null;
    const row = element.closest('.gantt-row');
    if (!row) return null;
    const id = parseInt(row.dataset.personId, 10);
    if (Number.isNaN(id)) return null;
    return id;
  },

  highlightDropTarget(personId) {
    if (this.currentDropHighlight === personId) return;
    this.clearDropTargetHighlight();
    if (!personId) return;
    const row = document.querySelector(`.gantt-row[data-person-id="${personId}"]`);
    if (row) {
      row.classList.add('drop-target');
      this.currentDropHighlight = personId;
    }
  },

  clearDropTargetHighlight() {
    if (!this.currentDropHighlight) return;
    const row = document.querySelector(`.gantt-row[data-person-id="${this.currentDropHighlight}"]`);
    row?.classList.remove('drop-target');
    this.currentDropHighlight = null;
  },

  commitProjectUpdate(projectId, start, end, assigneeChange = null) {
    if (window.App && typeof window.App.updateProjectTimeline === 'function') {
      window.App.updateProjectTimeline(projectId, start, end, assigneeChange);
    }
  },

  getTimelineMetrics(bar) {
    const row = bar.closest('.gantt-timeline-cells');
    if (!row) return null;
    const rect = row.getBoundingClientRect();
    return { width: rect.width || 1 };
  },

  getMinDuration(window = Infinity) {
    const day = 24 * 60 * 60 * 1000;
    if (!Number.isFinite(window) || window <= 0) return day;
    return Math.min(day, window);
  },

  formatTooltipDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  },

  showTimelineTooltip(bar, start, end) {
    const tooltip = document.getElementById('timelineTooltip');
    const container = document.getElementById('ganttContainer');
    if (!tooltip || !container || !bar) return;
    tooltip.textContent = `${this.formatTooltipDate(start)} → ${this.formatTooltipDate(end)}`;
    const barRect = bar.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const centerX = barRect.left - containerRect.left + barRect.width / 2;
    const boundedX = Math.max(16, Math.min(containerRect.width - 16, centerX));
    const top = Math.max(8, barRect.top - containerRect.top);
    tooltip.style.left = `${boundedX}px`;
    tooltip.style.top = `${top}px`;
    tooltip.classList.add('visible');
  },

  hideTimelineTooltip() {
    const tooltip = document.getElementById('timelineTooltip');
    if (!tooltip) return;
    tooltip.classList.remove('visible');
  },

  snapRange(start, end, { mode = 'drag', excludeProjectId = null, assigneeId = null } = {}) {
    if (!(start instanceof Date) || !(end instanceof Date)) {
      return { start, end };
    }

    let snappedStart = new Date(start);
    let snappedEnd = new Date(end);
    const duration = Math.max(DAY_MS, end.getTime() - start.getTime());
    const targets = this.getSnapTargets(excludeProjectId, assigneeId);

    const pickSnapDelta = (valueMs) => this.findSnapDelta(valueMs, targets);

    if (mode === 'drag') {
      const deltaStart = pickSnapDelta(snappedStart.getTime());
      const deltaEnd = pickSnapDelta(snappedEnd.getTime());
      let snapDelta = null;
      if (deltaStart !== null && deltaEnd !== null) {
        snapDelta = Math.abs(deltaStart) <= Math.abs(deltaEnd) ? deltaStart : deltaEnd;
      } else if (deltaStart !== null) {
        snapDelta = deltaStart;
      } else if (deltaEnd !== null) {
        snapDelta = deltaEnd;
      }

      if (snapDelta) {
        snappedStart = new Date(snappedStart.getTime() + snapDelta);
        snappedEnd = new Date(snappedEnd.getTime() + snapDelta);
      }

      snappedStart = this.snapDateToDay(snappedStart);
      const durationDays = Math.max(1, Math.round(duration / DAY_MS));
      snappedEnd = new Date(snappedStart.getTime() + durationDays * DAY_MS);
    } else if (mode === 'resize-start') {
      const delta = pickSnapDelta(snappedStart.getTime());
      if (delta) {
        snappedStart = new Date(snappedStart.getTime() + delta);
      }
      snappedStart = this.snapDateToDay(snappedStart);
      snappedEnd = this.snapDateToDay(snappedEnd);
      if (snappedEnd <= snappedStart) {
        snappedEnd = new Date(snappedStart.getTime() + DAY_MS);
      }
    } else if (mode === 'resize-end') {
      const delta = pickSnapDelta(snappedEnd.getTime());
      if (delta) {
        snappedEnd = new Date(snappedEnd.getTime() + delta);
      }
      snappedStart = this.snapDateToDay(snappedStart);
      snappedEnd = this.snapDateToDay(snappedEnd);
      if (snappedEnd <= snappedStart) {
        snappedEnd = new Date(snappedStart.getTime() + DAY_MS);
      }
    }

    return { start: snappedStart, end: snappedEnd };
  },

  snapDateToDay(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return date;
    const snapped = new Date(date);
    snapped.setHours(0, 0, 0, 0);
    const diff = date.getTime() - snapped.getTime();
    if (diff >= DAY_MS / 2) {
      snapped.setDate(snapped.getDate() + 1);
    }
    return snapped;
  },

  getSnapTargets(excludeProjectId = null, assigneeId = null) {
    const targets = [];
    if (this.quarterStart) {
      targets.push(this.snapDateToDay(this.quarterStart).getTime());
    }
    if (this.quarterEnd) {
      targets.push(this.snapDateToDay(this.quarterEnd).getTime());
    }

    this.projects.forEach((project) => {
      if (project.id === excludeProjectId) return;
      if (!project.startDate || !project.endDate) return;
      if (assigneeId && !this.projectHasAssignee(project, assigneeId)) return;
      const projectStart = new Date(project.startDate);
      const projectEnd = new Date(project.endDate);
      if (Number.isNaN(projectStart.getTime()) || Number.isNaN(projectEnd.getTime())) return;
      targets.push(projectStart.getTime(), projectEnd.getTime());
    });

    return targets;
  },

  findSnapDelta(value, targets = []) {
    let bestDelta = null;
    targets.forEach((target) => {
      const delta = target - value;
      if (Math.abs(delta) <= SNAP_THRESHOLD_MS) {
        if (bestDelta === null || Math.abs(delta) < Math.abs(bestDelta)) {
          bestDelta = delta;
        }
      }
    });
    return bestDelta;
  },

  projectHasAssignee(project, assigneeId) {
    const assignees = Array.isArray(project.assignees) ? project.assignees : [];
    return assignees.includes(assigneeId);
  },

  getProjectTheme(project) {
    const fallback = 'feature';
    if (!project) return fallback;
    const raw = typeof project.type === 'string' ? project.type.trim().toLowerCase() : '';
    const slug = raw.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return slug || fallback;
  },
};
