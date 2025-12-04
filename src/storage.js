export const Storage = {
  keys: {
    CAPACITY: 'quarterback_capacity',
    PROJECTS: 'quarterback_projects',
    TEAM: 'quarterback_team',
    SETTINGS: 'quarterback_settings',
    REGIONS: 'quarterback_regions',
    ROLES: 'quarterback_roles',
    COMPANY_HOLIDAYS: 'quarterback_company_holidays',
    DEMO_MODE: 'quarterback_demo_mode',
  },

  // Check if this is a fresh install with no user data
  isFirstTimeUser() {
    // If any of these exist, user has used the app before
    return !localStorage.getItem(this.keys.PROJECTS) 
      && !localStorage.getItem(this.keys.TEAM)
      && !localStorage.getItem(this.keys.CAPACITY);
  },

  // Check if currently showing demo data
  isDemoMode() {
    return localStorage.getItem(this.keys.DEMO_MODE) === 'true';
  },

  // Mark as demo mode
  setDemoMode(isDemo) {
    if (isDemo) {
      localStorage.setItem(this.keys.DEMO_MODE, 'true');
    } else {
      localStorage.removeItem(this.keys.DEMO_MODE);
    }
  },

  // Load demo data for new users
  loadDemoData() {
    const currentQuarter = this.getCurrentQuarter();
    const [qPart, yearPart] = currentQuarter.split('-');
    const quarterNum = parseInt(qPart.replace('Q', ''), 10);
    const year = parseInt(yearPart, 10);
    
    // Calculate quarter start date
    const quarterStartMonth = (quarterNum - 1) * 3;
    const quarterStart = new Date(year, quarterStartMonth, 1);
    
    // Helper to get a Monday-aligned date offset from quarter start
    const getWorkDate = (weekOffset, dayOffset = 0) => {
      const date = new Date(quarterStart);
      // Find first Monday of the quarter
      while (date.getDay() !== 1) {
        date.setDate(date.getDate() + 1);
      }
      date.setDate(date.getDate() + (weekOffset * 7) + dayOffset);
      return date.toISOString().split('T')[0];
    };

    // Demo team with realistic names and varied roles
    const demoTeam = [
      { id: 1, name: 'Sarah Chen', avatar: 'SC', regionId: 1, roleId: 1, color: 'hsl(210, 65%, 55%)', ptoDates: [getWorkDate(4, 0), getWorkDate(4, 1)] },
      { id: 2, name: 'Marcus Johnson', avatar: 'MJ', regionId: 1, roleId: 1, color: 'hsl(150, 65%, 45%)', ptoDates: [] },
      { id: 3, name: 'Elena Rodriguez', avatar: 'ER', regionId: 2, roleId: 2, color: 'hsl(280, 65%, 55%)', ptoDates: [getWorkDate(6, 2), getWorkDate(6, 3), getWorkDate(6, 4)] },
      { id: 4, name: 'James Kim', avatar: 'JK', regionId: 3, roleId: 1, color: 'hsl(30, 65%, 55%)', ptoDates: [] },
      { id: 5, name: 'Priya Patel', avatar: 'PP', regionId: 1, roleId: 3, color: 'hsl(340, 65%, 55%)', ptoDates: [getWorkDate(8, 0)] },
      { id: 6, name: 'Alex Thompson', avatar: 'AT', regionId: 1, roleId: 4, color: 'hsl(180, 65%, 45%)', ptoDates: [] },
    ];

    // Demo roles with focus percentages
    const demoRoles = [
      { id: 1, name: 'Senior Engineer', focus: 100 },
      { id: 2, name: 'Engineering Manager', focus: 50 },
      { id: 3, name: 'QA Engineer', focus: 90 },
      { id: 4, name: 'Tech Lead', focus: 70 },
    ];

    // Demo regions
    const demoRegions = [
      { id: 1, name: 'US West', ptoDays: 15, holidays: 10 },
      { id: 2, name: 'Europe', ptoDays: 25, holidays: 12 },
      { id: 3, name: 'Asia Pacific', ptoDays: 12, holidays: 15 },
    ];

    // Demo projects showing various states and types - well populated quarter
    const demoProjects = [
      // === SARAH CHEN (Senior Engineer, 100% focus) ===
      // Completed project - first 2 weeks
      {
        id: 1001,
        name: 'User Authentication Revamp',
        description: 'Implement OAuth2 and SSO support for enterprise customers',
        startDate: getWorkDate(0, 0),
        endDate: getWorkDate(1, 4),
        assignees: [1],
        status: 'completed',
        type: 'feature',
        confidence: 'high',
        mandayEstimate: 10,
        iceImpact: 9,
        iceConfidence: 8,
        iceEffort: 6,
        iceScore: 12,
      },
      // In progress - weeks 2-4
      {
        id: 1002,
        name: 'Session Management Overhaul',
        description: 'Improve session handling with refresh tokens and secure storage',
        startDate: getWorkDate(2, 0),
        endDate: getWorkDate(3, 4),
        assignees: [1],
        status: 'in-progress',
        type: 'security',
        confidence: 'high',
        mandayEstimate: 10,
        iceImpact: 9,
        iceConfidence: 9,
        iceEffort: 5,
        iceScore: 16.2,
      },
      // Planned - weeks 5-7
      {
        id: 1003,
        name: 'Payment Gateway Integration',
        description: 'Integrate with Stripe and PayPal for subscription billing',
        startDate: getWorkDate(5, 0),
        endDate: getWorkDate(7, 4),
        assignees: [1],
        status: 'planned',
        type: 'feature',
        confidence: 'medium',
        mandayEstimate: 15,
        iceImpact: 10,
        iceConfidence: 7,
        iceEffort: 8,
        iceScore: 8.75,
      },
      // Planned - weeks 8-10
      {
        id: 1004,
        name: 'Webhook System v2',
        description: 'Redesign webhook delivery with retry logic and dead letter queue',
        startDate: getWorkDate(8, 0),
        endDate: getWorkDate(10, 4),
        assignees: [1],
        status: 'planned',
        type: 'infrastructure',
        confidence: 'medium',
        mandayEstimate: 15,
        iceImpact: 8,
        iceConfidence: 7,
        iceEffort: 7,
        iceScore: 8,
      },

      // === MARCUS JOHNSON (Senior Engineer, 100% focus) ===
      // Completed - first 3 weeks
      {
        id: 1005,
        name: 'Dashboard Analytics V2',
        description: 'New analytics dashboard with real-time metrics and custom reports',
        startDate: getWorkDate(0, 0),
        endDate: getWorkDate(2, 4),
        assignees: [2],
        status: 'completed',
        type: 'feature',
        confidence: 'high',
        mandayEstimate: 15,
        iceImpact: 10,
        iceConfidence: 8,
        iceEffort: 7,
        iceScore: 11.43,
      },
      // In progress - weeks 3-5
      {
        id: 1006,
        name: 'Export & Reporting Engine',
        description: 'Build PDF/CSV export with scheduled report delivery',
        startDate: getWorkDate(3, 0),
        endDate: getWorkDate(5, 2),
        assignees: [2],
        status: 'in-progress',
        type: 'feature',
        confidence: 'high',
        mandayEstimate: 12,
        iceImpact: 8,
        iceConfidence: 8,
        iceEffort: 6,
        iceScore: 10.67,
      },
      // Planned - weeks 5-7
      {
        id: 1007,
        name: 'Critical Bug Fixes Sprint',
        description: 'Address high-priority bugs from customer feedback',
        startDate: getWorkDate(5, 3),
        endDate: getWorkDate(7, 2),
        assignees: [2],
        status: 'planned',
        type: 'bug-fix',
        confidence: 'high',
        mandayEstimate: 8,
        iceImpact: 9,
        iceConfidence: 9,
        iceEffort: 3,
        iceScore: 27,
      },
      // Planned - weeks 8-11
      {
        id: 1008,
        name: 'Real-time Collaboration',
        description: 'WebSocket-based real-time updates for multi-user editing',
        startDate: getWorkDate(8, 0),
        endDate: getWorkDate(11, 4),
        assignees: [2],
        status: 'planned',
        type: 'feature',
        confidence: 'low',
        mandayEstimate: 20,
        iceImpact: 9,
        iceConfidence: 5,
        iceEffort: 9,
        iceScore: 5,
      },

      // === ELENA RODRIGUEZ (Engineering Manager, 50% focus) ===
      // Completed - weeks 0-3 (8 mandays = 16 calendar days at 50%)
      {
        id: 1009,
        name: 'Q4 Technical Planning',
        description: 'Quarterly planning, architecture decisions, and roadmap alignment',
        startDate: getWorkDate(0, 0),
        endDate: getWorkDate(3, 4),
        assignees: [3],
        status: 'completed',
        type: 'planning',
        confidence: 'high',
        mandayEstimate: 8,
        iceImpact: 8,
        iceConfidence: 10,
        iceEffort: 3,
        iceScore: 26.67,
      },
      // In progress - weeks 4-7
      {
        id: 1010,
        name: 'Tech Debt Remediation Plan',
        description: 'Assess and prioritize technical debt items with team leads',
        startDate: getWorkDate(4, 0),
        endDate: getWorkDate(7, 4),
        assignees: [3],
        status: 'in-progress',
        type: 'tech-debt',
        confidence: 'high',
        mandayEstimate: 10,
        iceImpact: 7,
        iceConfidence: 9,
        iceEffort: 4,
        iceScore: 15.75,
      },
      // Planned - weeks 8-11
      {
        id: 1011,
        name: 'Team Process Improvements',
        description: 'Implement new code review guidelines and deployment processes',
        startDate: getWorkDate(8, 0),
        endDate: getWorkDate(11, 4),
        assignees: [3],
        status: 'planned',
        type: 'operations',
        confidence: 'medium',
        mandayEstimate: 10,
        iceImpact: 6,
        iceConfidence: 7,
        iceEffort: 4,
        iceScore: 10.5,
      },

      // === JAMES KIM (Senior Engineer, 100% focus) ===
      // Completed - weeks 0-2
      {
        id: 1012,
        name: 'CI/CD Pipeline Optimization',
        description: 'Reduce build times and improve deployment reliability',
        startDate: getWorkDate(0, 0),
        endDate: getWorkDate(2, 2),
        assignees: [4],
        status: 'completed',
        type: 'infrastructure',
        confidence: 'high',
        mandayEstimate: 12,
        iceImpact: 8,
        iceConfidence: 9,
        iceEffort: 5,
        iceScore: 14.4,
      },
      // In progress - weeks 2-4
      {
        id: 1013,
        name: 'Database Migration to PostgreSQL 16',
        description: 'Upgrade database with zero-downtime migration strategy',
        startDate: getWorkDate(2, 3),
        endDate: getWorkDate(4, 4),
        assignees: [4],
        status: 'in-progress',
        type: 'migration',
        confidence: 'medium',
        mandayEstimate: 12,
        iceImpact: 7,
        iceConfidence: 6,
        iceEffort: 6,
        iceScore: 7,
      },
      // At-risk - weeks 5-7 (dependency issues)
      {
        id: 1014,
        name: 'Kubernetes Cluster Upgrade',
        description: 'Upgrade K8s cluster to 1.29 with Istio service mesh',
        startDate: getWorkDate(5, 0),
        endDate: getWorkDate(7, 4),
        assignees: [4],
        status: 'at-risk',
        type: 'infrastructure',
        confidence: 'low',
        mandayEstimate: 15,
        iceImpact: 9,
        iceConfidence: 4,
        iceEffort: 8,
        iceScore: 4.5,
      },
      // Planned - weeks 8-10
      {
        id: 1015,
        name: 'Observability Stack Setup',
        description: 'Implement OpenTelemetry tracing and Grafana dashboards',
        startDate: getWorkDate(8, 0),
        endDate: getWorkDate(10, 4),
        assignees: [4],
        status: 'planned',
        type: 'infrastructure',
        confidence: 'medium',
        mandayEstimate: 15,
        iceImpact: 8,
        iceConfidence: 7,
        iceEffort: 7,
        iceScore: 8,
      },

      // === PRIYA PATEL (QA Engineer, 90% focus) ===
      // Completed - weeks 0-2
      {
        id: 1016,
        name: 'E2E Test Suite Expansion',
        description: 'Add comprehensive end-to-end tests for new features',
        startDate: getWorkDate(0, 0),
        endDate: getWorkDate(2, 4),
        assignees: [5],
        status: 'completed',
        type: 'testing',
        confidence: 'high',
        mandayEstimate: 12,
        iceImpact: 7,
        iceConfidence: 9,
        iceEffort: 4,
        iceScore: 15.75,
      },
      // In progress - weeks 3-5
      {
        id: 1017,
        name: 'Performance Testing Framework',
        description: 'Set up k6 load testing with CI integration',
        startDate: getWorkDate(3, 0),
        endDate: getWorkDate(5, 2),
        assignees: [5],
        status: 'in-progress',
        type: 'testing',
        confidence: 'high',
        mandayEstimate: 10,
        iceImpact: 8,
        iceConfidence: 8,
        iceEffort: 5,
        iceScore: 12.8,
      },
      // Planned - weeks 5-7
      {
        id: 1018,
        name: 'Security Audit Prep',
        description: 'Prepare documentation and test coverage for SOC2 audit',
        startDate: getWorkDate(5, 3),
        endDate: getWorkDate(7, 4),
        assignees: [5],
        status: 'planned',
        type: 'security',
        confidence: 'high',
        mandayEstimate: 10,
        iceImpact: 10,
        iceConfidence: 8,
        iceEffort: 5,
        iceScore: 16,
      },
      // Planned - weeks 8-10
      {
        id: 1019,
        name: 'API Contract Testing',
        description: 'Implement Pact contract tests for microservices',
        startDate: getWorkDate(8, 0),
        endDate: getWorkDate(10, 2),
        assignees: [5],
        status: 'planned',
        type: 'testing',
        confidence: 'medium',
        mandayEstimate: 10,
        iceImpact: 7,
        iceConfidence: 7,
        iceEffort: 5,
        iceScore: 9.8,
      },

      // === ALEX THOMPSON (Tech Lead, 70% focus) ===
      // Completed - weeks 0-4 (14 mandays = 20 calendar days at 70%)
      {
        id: 1020,
        name: 'Microservices Architecture Design',
        description: 'Design and document the migration path to microservices',
        startDate: getWorkDate(0, 0),
        endDate: getWorkDate(4, 0),
        assignees: [6],
        status: 'completed',
        type: 'research',
        confidence: 'high',
        mandayEstimate: 14,
        iceImpact: 10,
        iceConfidence: 8,
        iceEffort: 7,
        iceScore: 11.43,
      },
      // In progress - weeks 4-7
      {
        id: 1021,
        name: 'API Gateway Implementation',
        description: 'Set up Kong API gateway with authentication and rate limiting',
        startDate: getWorkDate(4, 1),
        endDate: getWorkDate(7, 4),
        assignees: [6],
        status: 'in-progress',
        type: 'infrastructure',
        confidence: 'medium',
        mandayEstimate: 15,
        iceImpact: 9,
        iceConfidence: 6,
        iceEffort: 7,
        iceScore: 7.71,
      },
      // Planned - weeks 8-11
      {
        id: 1022,
        name: 'Service Mesh Rollout',
        description: 'Deploy Istio service mesh for inter-service communication',
        startDate: getWorkDate(8, 0),
        endDate: getWorkDate(11, 4),
        assignees: [6],
        status: 'planned',
        type: 'infrastructure',
        confidence: 'low',
        mandayEstimate: 18,
        iceImpact: 8,
        iceConfidence: 5,
        iceEffort: 9,
        iceScore: 4.44,
      },

      // === MULTI-PERSON PROJECTS ===
      // Weeks 10-12 - End of quarter push
      {
        id: 1023,
        name: 'Holiday Feature Freeze Prep',
        description: 'Stabilization sprint before end-of-year code freeze',
        startDate: getWorkDate(10, 0),
        endDate: getWorkDate(12, 4),
        assignees: [1, 2],
        status: 'planned',
        type: 'operations',
        confidence: 'high',
        mandayEstimate: 20,
        iceImpact: 9,
        iceConfidence: 9,
        iceEffort: 5,
        iceScore: 16.2,
      },

      // === BACKLOG (unscheduled) ===
      {
        id: 1030,
        name: 'API Rate Limiting',
        description: 'Implement configurable rate limiting for public APIs',
        startDate: '',
        endDate: '',
        assignees: [],
        status: 'backlog',
        type: 'infrastructure',
        confidence: 'medium',
        mandayEstimate: 8,
        iceImpact: 7,
        iceConfidence: 8,
        iceEffort: 4,
        iceScore: 14,
      },
      {
        id: 1031,
        name: 'Dark Mode Support',
        description: 'Add dark mode theme option for the web application',
        startDate: '',
        endDate: '',
        assignees: [],
        status: 'backlog',
        type: 'feature',
        confidence: 'high',
        mandayEstimate: 5,
        iceImpact: 6,
        iceConfidence: 9,
        iceEffort: 2,
        iceScore: 27,
      },
      {
        id: 1032,
        name: 'Mobile Push Notifications',
        description: 'Implement push notifications for iOS and Android apps',
        startDate: '',
        endDate: '',
        assignees: [],
        status: 'backlog',
        type: 'feature',
        confidence: 'medium',
        mandayEstimate: 12,
        iceImpact: 8,
        iceConfidence: 6,
        iceEffort: 6,
        iceScore: 8,
      },
      {
        id: 1033,
        name: 'GraphQL API Layer',
        description: 'Add GraphQL endpoint alongside REST API',
        startDate: '',
        endDate: '',
        assignees: [],
        status: 'backlog',
        type: 'feature',
        confidence: 'low',
        mandayEstimate: 20,
        iceImpact: 7,
        iceConfidence: 4,
        iceEffort: 8,
        iceScore: 3.5,
      },
      {
        id: 1034,
        name: 'Accessibility Audit & Fixes',
        description: 'WCAG 2.1 AA compliance review and remediation',
        startDate: '',
        endDate: '',
        assignees: [],
        status: 'backlog',
        type: 'feature',
        confidence: 'high',
        mandayEstimate: 10,
        iceImpact: 8,
        iceConfidence: 8,
        iceEffort: 5,
        iceScore: 12.8,
      },
      {
        id: 1035,
        name: 'Customer Data Export Tool',
        description: 'GDPR-compliant data export for enterprise customers',
        startDate: '',
        endDate: '',
        assignees: [],
        status: 'backlog',
        type: 'feature',
        confidence: 'high',
        mandayEstimate: 6,
        iceImpact: 7,
        iceConfidence: 9,
        iceEffort: 3,
        iceScore: 21,
      },
    ];

    // Demo capacity reflecting the team
    const demoCapacity = {
      numEngineers: 6,
      ptoPerPerson: 8,
      companyHolidays: 10,
      adhocReserve: 15,
      bugReserve: 10,
    };

    // Demo company holidays
    const demoHolidays = this.getDefaultCompanyHolidays();

    return {
      team: demoTeam,
      roles: demoRoles,
      regions: demoRegions,
      projects: demoProjects,
      capacity: demoCapacity,
      companyHolidays: demoHolidays,
    };
  },

  // Initialize demo mode for new users
  initializeDemoMode() {
    const demoData = this.loadDemoData();
    this.saveTeam(demoData.team);
    this.saveRoles(demoData.roles);
    this.saveRegions(demoData.regions);
    this.saveProjects(demoData.projects);
    this.saveCapacity(demoData.capacity);
    this.saveCompanyHolidays(demoData.companyHolidays);
    this.setDemoMode(true);
  },

  // Clear all data and start fresh (exit demo mode)
  clearAndStartFresh() {
    this.clearAll();
    this.setDemoMode(false);
  },

  saveCapacity(data) {
    localStorage.setItem(this.keys.CAPACITY, JSON.stringify(data));
  },

  loadCapacity() {
    const data = localStorage.getItem(this.keys.CAPACITY);
    return data ? JSON.parse(data) : this.getDefaultCapacity();
  },

  getDefaultCapacity() {
    return {
      numEngineers: 5,
      ptoPerPerson: 8,
      companyHolidays: 10,
      adhocReserve: 20,
      bugReserve: 10,
      theoreticalCapacity: 450,
      timeOffTotal: 90,
      reserveTotal: 135,
      netCapacity: 225,
    };
  },

  saveProjects(projects) {
    localStorage.setItem(this.keys.PROJECTS, JSON.stringify(projects));
  },

  loadProjects() {
    const data = localStorage.getItem(this.keys.PROJECTS);
    return data ? JSON.parse(data) : [];
  },

  saveTeam(team) {
    localStorage.setItem(this.keys.TEAM, JSON.stringify(team));
  },

  loadTeam() {
    const data = localStorage.getItem(this.keys.TEAM);
    return data ? JSON.parse(data) : this.getDefaultTeam();
  },

  getDefaultTeam() {
    return [
      { id: 1, name: 'Alice Chen', avatar: 'AC', regionId: 1, roleId: 1 },
      { id: 2, name: 'Bob Smith', avatar: 'BS', regionId: 1, roleId: 1 },
      { id: 3, name: 'Carol Davis', avatar: 'CD', regionId: 2, roleId: 2 },
      { id: 4, name: 'David Kumar', avatar: 'DK', regionId: 3, roleId: 1 },
      { id: 5, name: 'Emma Wilson', avatar: 'EW', regionId: 1, roleId: 3 },
    ];
  },

  saveRegions(regions) {
    localStorage.setItem(this.keys.REGIONS, JSON.stringify(regions));
  },

  loadRegions() {
    const data = localStorage.getItem(this.keys.REGIONS);
    return data ? JSON.parse(data) : this.getDefaultRegions();
  },

  getDefaultRegions() {
    return [
      { id: 1, name: 'North America', ptoDays: 12, holidays: 5 },
      { id: 2, name: 'EMEA', ptoDays: 10, holidays: 8 },
      { id: 3, name: 'APAC', ptoDays: 15, holidays: 7 },
    ];
  },

  saveRoles(roles) {
    localStorage.setItem(this.keys.ROLES, JSON.stringify(roles));
  },

  loadRoles() {
    const data = localStorage.getItem(this.keys.ROLES);
    return data ? JSON.parse(data) : this.getDefaultRoles();
  },

  getDefaultRoles() {
    return [
      { id: 1, name: 'IC Engineer', focus: 100 },
      { id: 2, name: 'Engineering Manager', focus: 60 },
      { id: 3, name: 'QA / SDET', focus: 90 },
    ];
  },

  saveSettings(settings) {
    localStorage.setItem(this.keys.SETTINGS, JSON.stringify(settings));
  },

  loadSettings() {
    const defaults = this.getDefaultSettings();
    const data = localStorage.getItem(this.keys.SETTINGS);
    if (!data) return defaults;
    try {
      const parsed = JSON.parse(data);
      const settings = { ...defaults, ...parsed };
      // Migrate legacy theme values
      settings.theme = this.migrateTheme(settings.theme);
      return settings;
    } catch (error) {
      console.warn('Unable to parse settings from storage', error);
      return defaults;
    }
  },

  getDefaultSettings() {
    const prefersDark = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return {
      viewType: 'quarter',
      groupBy: 'person',
      currentQuarter: this.getCurrentQuarter(),
      theme: prefersDark ? 'monokai' : 'light',
      countryCode: 'US',
    };
  },

  // Migrate legacy theme values to new format
  migrateTheme(theme) {
    if (theme === 'dark') return 'monokai';
    if (!theme) return 'light';
    return theme;
  },

  getCurrentQuarter() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const quarter = Math.floor(month / 3) + 1;
    return `Q${quarter}-${year}`;
  },

  clearAll() {
    Object.values(this.keys).forEach((key) => localStorage.removeItem(key));
  },

  saveCompanyHolidays(holidays) {
    localStorage.setItem(this.keys.COMPANY_HOLIDAYS, JSON.stringify(holidays));
  },

  loadCompanyHolidays() {
    const data = localStorage.getItem(this.keys.COMPANY_HOLIDAYS);
    return data ? JSON.parse(data) : this.getDefaultCompanyHolidays();
  },

  getDefaultCompanyHolidays() {
    // Default US company holidays for current year
    const year = new Date().getFullYear();
    return [
      { date: `${year}-01-01`, name: "New Year's Day" },
      { date: `${year}-01-02`, name: 'New Year Holiday' },
      { date: `${year}-01-03`, name: 'New Year Holiday' },
      { date: `${year}-01-20`, name: 'MLK Day' },
      { date: `${year}-02-17`, name: "Presidents' Day" },
      { date: `${year}-05-26`, name: 'Memorial Day' },
      { date: `${year}-07-04`, name: 'Independence Day' },
      { date: `${year}-09-01`, name: 'Labor Day' },
      { date: `${year}-11-27`, name: 'Thanksgiving' },
      { date: `${year}-11-28`, name: 'Day after Thanksgiving' },
      { date: `${year}-12-24`, name: 'Christmas Eve' },
      { date: `${year}-12-25`, name: 'Christmas Day' },
      { date: `${year}-12-26`, name: 'Day after Christmas' },
      { date: `${year}-12-31`, name: "New Year's Eve" },
    ];
  },

  exportData() {
    return {
      capacity: this.loadCapacity(),
      projects: this.loadProjects(),
      team: this.loadTeam(),
      settings: this.loadSettings(),
      regions: this.loadRegions(),
      roles: this.loadRoles(),
      companyHolidays: this.loadCompanyHolidays(),
      exportDate: new Date().toISOString(),
    };
  },

  importData(data) {
    if (data.capacity) this.saveCapacity(data.capacity);

    // Validate and clean projects before importing
    if (data.projects) {
      const validProjects = Array.isArray(data.projects)
        ? data.projects.filter((project) => {
            // Validate date ranges
            if (project.startDate && project.endDate) {
              const start = new Date(project.startDate);
              const end = new Date(project.endDate);
              if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
                if (end < start) {
                  console.warn(`Project "${project.name || 'Unknown'}": End date before start date. Clearing dates.`);
                  project.startDate = '';
                  project.endDate = '';
                }
              }
            }
            return true; // Keep project but with cleaned dates
          })
        : [];
      this.saveProjects(validProjects);
    }

    if (data.team) this.saveTeam(data.team);
    if (data.settings) this.saveSettings(data.settings);
    if (data.regions) this.saveRegions(data.regions);
    if (data.roles) this.saveRoles(data.roles);
    if (data.companyHolidays) this.saveCompanyHolidays(data.companyHolidays);
  },
};
