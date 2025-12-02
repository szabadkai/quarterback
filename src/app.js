import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Storage } from './storage.js';
import { CapacityCalculator } from './capacity.js';
import { GanttChart } from './gantt.js';

class QuarterBackApp {
  constructor() {
    this.capacity = null;
    this.projects = [];
    this.team = [];
    this.regions = [];
    this.roles = [];
    this.settings = null;
    this.currentProject = null;
    this.searchTerm = '';
    this.filterStatus = '';
    this.filterAssignee = '';
    this.filterType = '';
    this.iceInputsBound = false;
    this.backlogDurationDays = 14;
    this.backlogDragMime = 'application/x-quarterback-project';
    this.backlogUnscheduleMime = 'application/x-quarterback-unschedule';
    this.dragPreviewElement = null;
    this.storyPointDayRatio = 1; // 1 story point ≈ 1 day of focused work
    this.minAutoScheduleDays = 3;
    // Undo/Redo history
    this.undoStack = [];
    this.redoStack = [];
    this.maxHistorySize = 50;
    this.selectedProjectId = null;
    this.spreadsheetInstance = null;
  }

  init() {
    this.loadData();
    this.ensureCapacityTotals();
    this.initUI();
    this.attachEventListeners();
    this.updateCapacityDisplay();
    this.refreshGantt();
  }

  loadData() {
    this.capacity = Storage.loadCapacity();
    const storedProjects = Storage.loadProjects();
    this.projects = storedProjects.map((project, index) => {
      const normalizedAssignees = Array.isArray(project.assignees)
        ? project.assignees
        : [project.assignees].filter(Boolean);
      const iceImpact = this.normalizeIceValue(project.iceImpact ?? 5);
      const iceConfidence = this.normalizeIceValue(project.iceConfidence ?? 5);
      const iceEffort = this.normalizeIceValue(project.iceEffort ?? 5);
      const storyPoints = this.estimateStoryPoints(iceEffort, iceConfidence, project.storyPoints);
      const mandayEstimate = this.normalizeManDayEstimate(project.mandayEstimate)
        ?? Math.max(this.minAutoScheduleDays, Math.round(storyPoints * this.storyPointDayRatio));
      return {
        id: project.id ?? Date.now() + index,
        name: project.name || `Project ${index + 1}`,
        startDate: project.startDate || '',
        endDate: project.endDate || '',
        assignees: normalizedAssignees,
        status: project.status || 'planned',
        confidence: project.confidence || 'medium',
        type: project.type || 'feature',
        description: project.description || '',
        ...project,
        iceImpact,
        iceConfidence,
        iceEffort,
        storyPoints,
        mandayEstimate,
      };
    });
    this.regions = Storage.loadRegions();
    this.roles = Storage.loadRoles();
    this.companyHolidays = Storage.loadCompanyHolidays();
    this.team = this.normalizeTeamMembers(Storage.loadTeam());
    Storage.saveTeam(this.team);
    this.settings = Storage.loadSettings();
    if (!this.settings.theme) {
      this.settings.theme = Storage.getDefaultSettings().theme;
      Storage.saveSettings(this.settings);
    }
  }

  normalizeTeamMembers(members = []) {
    const defaultRegionId = this.regions[0]?.id ?? null;
    const defaultRoleId = this.roles[0]?.id ?? null;
    return members.map((member, index) => {
      const fallbackName = member.name || `Team Member ${index + 1}`;
      const normalized = {
        ...member,
        id: member.id ?? Date.now() + index,
        name: fallbackName,
        avatar: member.avatar || this.getInitials(fallbackName),
        regionId: member.regionId ?? defaultRegionId,
        roleId: member.roleId ?? defaultRoleId,
        color: member.color || this.generateMemberColor(fallbackName),
      };
      return normalized;
    });
  }

  ensureCapacityTotals() {
    if (typeof this.capacity.netCapacity !== 'number') {
      this.capacity = {
        ...this.capacity,
        ...CapacityCalculator.calculate({
          ...this.capacity,
          team: this.team,
          regions: this.regions,
          roles: this.roles,
          quarter: this.settings.currentQuarter,
        }),
      };
      Storage.saveCapacity(this.capacity);
    }
  }

  initUI() {
    this.syncQuarterSelect();
    const viewSelect = document.getElementById('viewTypeSelect');
    const groupSelect = document.getElementById('groupBySelect');
    if (viewSelect) viewSelect.value = this.settings.viewType;
    if (groupSelect) groupSelect.value = this.settings.groupBy;
    this.renderTeamMembersList();
    this.renderRegionSettings();
    this.renderRoleSettings();
    this.initBacklogToggle();
    this.renderBacklog();
    this.populateAssigneeSelect();
    this.populateFilterAssignees();
    this.initIceInputs();
    this.applyTheme(this.settings.theme);
  }

  syncQuarterSelect() {
    this.generateQuarterOptions();
  }

  parseQuarterLabel(label) {
    const match = /^Q([1-4])-(\d{4})$/.exec(label);
    if (!match) {
      const fallback = Storage.getCurrentQuarter();
      return this.parseQuarterLabel(fallback);
    }
    return { quarter: parseInt(match[1], 10), year: parseInt(match[2], 10) };
  }

  getQuarterOrder(label) {
    const { quarter, year } = this.parseQuarterLabel(label);
    return year * 4 + (quarter - 1);
  }

  orderToQuarterLabel(order) {
    if (order < 0) return null;
    const year = Math.floor(order / 4);
    const quarterIndex = order % 4;
    const quarter = quarterIndex + 1;
    return `Q${quarter}-${year}`;
  }

  getQuarterDisplay(label) {
    return label.replace('-', ' ');
  }

  generateQuarterOptions() {
    const select = document.getElementById('quarterSelect');
    if (!select) return;

    const nowLabel = Storage.getCurrentQuarter();
    const nowOrder = this.getQuarterOrder(nowLabel);
    const currentOrder = this.getQuarterOrder(this.settings.currentQuarter);
    const startOrder = Math.min(nowOrder, currentOrder) - 2;
    const totalQuarters = 14; // two quarters back + 11 forward (~3.5 years)
    const options = [];

    for (let i = 0; i < totalQuarters; i += 1) {
      const order = startOrder + i;
      const value = this.orderToQuarterLabel(order);
      if (!value) continue;
      options.push({ value, label: this.getQuarterDisplay(value) });
    }

    if (!options.some((option) => option.value === this.settings.currentQuarter)) {
      const value = this.settings.currentQuarter;
      options.push({ value, label: this.getQuarterDisplay(value) });
    }

    const unique = new Map();
    options.forEach((option) => {
      unique.set(option.value, option);
    });

    const sorted = Array.from(unique.values()).sort(
      (a, b) => this.getQuarterOrder(a.value) - this.getQuarterOrder(b.value),
    );

    select.innerHTML = sorted
      .map((option) => `<option value="${option.value}">${option.label}</option>`)
      .join('');
    select.value = this.settings.currentQuarter;
  }

  attachEventListeners() {
    document.getElementById('capacityBtn')?.addEventListener('click', () => this.openCapacityModal());
    document.getElementById('exportBtn')?.addEventListener('click', () => this.openExportModal());
    document.getElementById('shareBtn')?.addEventListener('click', () => this.shareView());
    document.getElementById('themeSelect')?.addEventListener('change', (event) => this.changeTheme(event.target.value));
    document.getElementById('addProjectBtn')?.addEventListener('click', () => this.openProjectModal());
    document.getElementById('setupCapacityBtn')?.addEventListener('click', () => this.openCapacityModal());
    document.getElementById('addFirstProjectBtn')?.addEventListener('click', () => this.openProjectModal());
    document.getElementById('autoAllocateBtn')?.addEventListener('click', () => this.autoAllocateBacklog());
    document.getElementById('resetBoardBtn')?.addEventListener('click', () => this.resetBoardToBacklog());
    document.getElementById('filterBtn')?.addEventListener('click', () => this.showToast('Advanced filters coming soon', 'success'));
    document.getElementById('importBtn')?.addEventListener('click', () => this.openImportModal());

    document.getElementById('quarterSelect')?.addEventListener('change', (event) => {
      this.changeQuarter(event.target.value);
    });

    document.getElementById('viewTypeSelect')?.addEventListener('change', (event) => {
      this.changeView(event.target.value);
    });

    document.getElementById('groupBySelect')?.addEventListener('change', (event) => {
      this.changeGrouping(event.target.value);
    });

    document.getElementById('searchInput')?.addEventListener('input', (event) => {
      this.searchProjects(event.target.value);
    });

    document.getElementById('filterStatus')?.addEventListener('change', (event) => {
      this.filterStatus = event.target.value;
      this.refreshGantt();
    });

    document.getElementById('filterAssignee')?.addEventListener('change', (event) => {
      this.filterAssignee = event.target.value;
      this.refreshGantt();
    });

    document.getElementById('filterType')?.addEventListener('change', (event) => {
      this.filterType = event.target.value;
      this.refreshGantt();
    });

    document.getElementById('clearFiltersBtn')?.addEventListener('click', () => {
      this.clearAllFilters();
    });

    document.getElementById('closeCapacityModal')?.addEventListener('click', () => this.closeCapacityModal());
    document.getElementById('cancelCapacityBtn')?.addEventListener('click', () => this.closeCapacityModal());
    document.getElementById('applyCapacityBtn')?.addEventListener('click', () => this.applyCapacity());
    document.getElementById('addTeamMemberBtn')?.addEventListener('click', () => this.addTeamMember());
    document.getElementById('addRegionBtn')?.addEventListener('click', () => this.addRegion());
    document.getElementById('addRoleBtn')?.addEventListener('click', () => this.addRole());

    document.getElementById('numEngineers')?.addEventListener('input', () => this.handleEngineerCountChange());
    document.getElementById('ptoPerPerson')?.addEventListener('input', () => this.recalculateCapacity());
    document.getElementById('adhocReserve')?.addEventListener('change', () => this.recalculateCapacity());
    document.getElementById('bugReserve')?.addEventListener('change', () => this.recalculateCapacity());

    document.getElementById('closeProjectModal')?.addEventListener('click', () => this.closeProjectModal());
    document.getElementById('cancelProjectBtn')?.addEventListener('click', () => this.closeProjectModal());
    document.getElementById('saveProjectBtn')?.addEventListener('click', () => this.saveProject());
    document.getElementById('deleteProjectBtn')?.addEventListener('click', () => this.deleteProject());
    document.getElementById('clearAssigneesBtn')?.addEventListener('click', () => this.clearAssigneesInModal());
    document.getElementById('clearDatesBtn')?.addEventListener('click', () => this.clearDatesInModal());
    document.getElementById('sendToBacklogBtn')?.addEventListener('click', () => this.sendCurrentProjectToBacklog());

    document.getElementById('closeExportModal')?.addEventListener('click', () => this.closeExportModal());
    document.getElementById('exportPNGBtn')?.addEventListener('click', () => this.exportPNG());
    document.getElementById('exportPDFBtn')?.addEventListener('click', () => this.exportPDF());
    document.getElementById('exportCSVBtn')?.addEventListener('click', () => this.exportCSV());
    document.getElementById('exportJSONBtn')?.addEventListener('click', () => this.exportJSON());
    document.getElementById('closeImportModal')?.addEventListener('click', () => this.closeImportModal());
    document.getElementById('cancelImportBtn')?.addEventListener('click', () => this.closeImportModal());
    document.getElementById('runImportBtn')?.addEventListener('click', () => this.handleImportSubmit());
    document.getElementById('importFormatSelect')?.addEventListener('change', (e) => this.updateImportHint(e.target.value));

    // PTO modal
    document.getElementById('closePtoModal')?.addEventListener('click', () => this.closePtoModal());
    document.getElementById('savePtoBtn')?.addEventListener('click', () => this.closePtoModal());
    document.getElementById('addPtoDateBtn')?.addEventListener('click', () => this.addPtoDate());

    // Type Preferences modal
    document.getElementById('closeTypePreferencesModal')?.addEventListener('click', () => this.closeTypePreferencesModal());
    document.getElementById('saveTypePreferencesBtn')?.addEventListener('click', () => this.saveTypePreferences());

    // Company Holidays modal
    document.getElementById('manageHolidaysBtn')?.addEventListener('click', () => this.openHolidaysModal());
    document.getElementById('closeHolidaysModal')?.addEventListener('click', () => this.closeHolidaysModal());
    document.getElementById('saveHolidaysBtn')?.addEventListener('click', () => this.closeHolidaysModal());
    document.getElementById('addHolidayBtn')?.addEventListener('click', () => this.addCompanyHoliday());
    document.getElementById('fetchHolidaysBtn')?.addEventListener('click', () => this.fetchPublicHolidays());

    // Spreadsheet modal
    document.getElementById('spreadsheetBtn')?.addEventListener('click', () => this.openSpreadsheetModal());
    document.getElementById('closeSpreadsheetModal')?.addEventListener('click', () => this.closeSpreadsheetModal());
    document.getElementById('cancelSpreadsheetBtn')?.addEventListener('click', () => this.closeSpreadsheetModal());
    document.getElementById('saveSpreadsheetBtn')?.addEventListener('click', () => this.saveSpreadsheetChanges());
    document.getElementById('addRowBtn')?.addEventListener('click', () => this.addSpreadsheetRow());
    document.getElementById('deleteSelectedRowsBtn')?.addEventListener('click', () => this.deleteSelectedSpreadsheetRows());

    document.querySelectorAll('.modal').forEach((modal) => {
      modal.addEventListener('click', (event) => {
        if (event.target === modal) {
          modal.classList.remove('active');
        }
      });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (event) => this.handleKeyboardShortcut(event));

    // Conflict indicator click
    document.getElementById('conflictIndicator')?.addEventListener('click', () => this.showConflictWarnings());
  }

  openCapacityModal() {
    const engineersInput = document.getElementById('numEngineers');
    if (engineersInput) engineersInput.value = this.capacity.numEngineers ?? this.team.length;
    document.getElementById('ptoPerPerson').value = this.capacity.ptoPerPerson;
    document.getElementById('adhocReserve').value = this.capacity.adhocReserve;
    document.getElementById('bugReserve').value = this.capacity.bugReserve;
    
    // Update company holidays count display
    this.updateCompanyHolidaysCount();

    this.renderTeamMembersList();
    this.recalculateCapacity();
    document.getElementById('capacityModal')?.classList.add('active');
  }

  closeCapacityModal() {
    document.getElementById('capacityModal')?.classList.remove('active');
  }

  getAvailableThemes() {
    return [
      { id: 'light', name: 'Light (Default)', isDark: false },
      { id: 'github-light', name: 'GitHub Light', isDark: false },
      { id: 'solarized-light', name: 'Solarized Light', isDark: false },
      { id: 'quiet-light', name: 'Quiet Light', isDark: false },
      { id: 'monokai', name: 'Monokai', isDark: true },
      { id: 'one-dark-pro', name: 'One Dark Pro', isDark: true },
      { id: 'dracula', name: 'Dracula', isDark: true },
      { id: 'github-dark', name: 'GitHub Dark', isDark: true },
      { id: 'nord', name: 'Nord', isDark: true },
      { id: 'solarized-dark', name: 'Solarized Dark', isDark: true },
      { id: 'night-owl', name: 'Night Owl', isDark: true },
    ];
  }

  isCurrentThemeDark() {
    const themes = this.getAvailableThemes();
    const currentTheme = themes.find(t => t.id === this.settings.theme);
    return currentTheme?.isDark ?? false;
  }

  applyTheme(theme) {
    const themes = this.getAvailableThemes();
    const themeInfo = themes.find(t => t.id === theme) || themes[0];
    this.settings.theme = themeInfo.id;
    
    const body = document.body;
    if (body) {
      // Remove all theme classes
      themes.forEach(t => {
        body.classList.remove(`theme-${t.id}`);
      });
      body.classList.remove('theme-dark'); // Legacy support
      
      // Apply new theme class (light theme uses :root defaults, so no class needed)
      if (themeInfo.id !== 'light') {
        body.classList.add(`theme-${themeInfo.id}`);
      }
    }
    
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) {
      themeSelect.value = themeInfo.id;
    }
  }

  changeTheme(themeId) {
    const themes = this.getAvailableThemes();
    const themeInfo = themes.find(t => t.id === themeId) || themes[0];
    this.applyTheme(themeInfo.id);
    Storage.saveSettings(this.settings);
    this.showToast(`${themeInfo.name} theme applied`, 'success');
  }

  renderTeamMembersList() {
    const list = document.getElementById('teamMembersList');
    if (!list) return;
    if (!this.team.length) {
      this.team = this.normalizeTeamMembers(Storage.getDefaultTeam());
      Storage.saveTeam(this.team);
      this.populateAssigneeSelect();
    }

    const ensureId = (value, fallback) => (value ?? fallback);

    list.innerHTML = this.team
      .map((member) => {
        const safeName = this.escapeHtml(member.name);
        const regionId = ensureId(member.regionId, this.regions[0]?.id ?? null);
        const roleId = ensureId(member.roleId, this.roles[0]?.id ?? null);
        const regionOptions = this.regions.length
          ? this.regions
              .map(
                (region) => `<option value="${region.id}" ${region.id === regionId ? 'selected' : ''}>${this.escapeHtml(region.name)}</option>`,
              )
              .join('')
          : '<option value="" disabled>No regions configured</option>';
        const roleOptions = this.roles.length
          ? this.roles
              .map(
                (role) => `<option value="${role.id}" ${role.id === roleId ? 'selected' : ''}>${this.escapeHtml(role.name)}</option>`,
              )
              .join('')
          : '<option value="" disabled>No roles configured</option>';

        const ptoDatesCount = Array.isArray(member.ptoDates) ? member.ptoDates.length : 0;
        const prefsCount = member.typePreferences ? Object.keys(member.typePreferences).filter(k => member.typePreferences[k] !== 'neutral').length : 0;
        return `
          <div class="team-member-item" data-id="${member.id}">
            <div class="team-member-fields">
              <input type="text" value="${safeName}" aria-label="Team member name" />
              <select class="team-region-select" aria-label="Select region" data-id="${member.id}">
                ${regionOptions}
              </select>
              <select class="team-role-select" aria-label="Select role" data-id="${member.id}">
                ${roleOptions}
              </select>
            </div>
            <button type="button" class="btn btn-small btn-secondary type-prefs-btn" data-id="${member.id}" title="Task type preferences">🎯 ${prefsCount > 0 ? `(${prefsCount})` : ''}</button>
            <button type="button" class="btn btn-small btn-secondary pto-btn" data-id="${member.id}" title="Manage PTO dates">📅 ${ptoDatesCount > 0 ? `(${ptoDatesCount})` : ''}</button>
            <button type="button" class="btn btn-small btn-secondary remove-member-btn" data-id="${member.id}">Remove</button>
          </div>
        `;
      })
      .join('');

    const disableRemoval = this.team.length <= 1;
    list.querySelectorAll('.remove-member-btn').forEach((button) => {
      button.disabled = disableRemoval;
      button.addEventListener('click', () => this.removeTeamMember(parseInt(button.dataset.id, 10)));
    });

    list.querySelectorAll('.pto-btn').forEach((button) => {
      button.addEventListener('click', () => this.openPtoModal(parseInt(button.dataset.id, 10)));
    });

    list.querySelectorAll('.type-prefs-btn').forEach((button) => {
      button.addEventListener('click', () => this.openTypePreferencesModal(parseInt(button.dataset.id, 10)));
    });

    list.querySelectorAll('input').forEach((input) => {
      input.addEventListener('input', (event) => {
        const parent = event.target.closest('.team-member-item');
        const id = parseInt(parent.dataset.id, 10);
        this.renameTeamMember(id, event.target.value);
      });
    });

    list.querySelectorAll('.team-region-select').forEach((select) => {
      select.addEventListener('change', (event) => {
        const id = parseInt(event.target.dataset.id, 10);
        this.updateTeamMemberRegion(id, parseInt(event.target.value, 10));
      });
    });

    list.querySelectorAll('.team-role-select').forEach((select) => {
      select.addEventListener('change', (event) => {
        const id = parseInt(event.target.dataset.id, 10);
        this.updateTeamMemberRole(id, parseInt(event.target.value, 10));
      });
    });
  }

  renderRegionSettings() {
    const container = document.getElementById('regionSettingsList');
    if (!container) return;
    if (!this.regions.length) {
      this.regions = Storage.getDefaultRegions();
      Storage.saveRegions(this.regions);
    }

    container.innerHTML = this.regions
      .map(
        (region) => `
          <div class="config-item" data-id="${region.id}">
            <input type="text" value="${this.escapeHtml(region.name)}" data-field="name" />
            <input type="number" value="${region.ptoDays}" min="0" max="60" data-field="ptoDays" />
            <input type="number" value="${region.holidays}" min="0" max="30" data-field="holidays" />
            <button type="button" class="btn btn-small btn-secondary remove-region-btn" data-id="${region.id}">Remove</button>
          </div>
        `,
      )
      .join('');

    container.querySelectorAll('input').forEach((input) => {
      input.addEventListener('input', (event) => {
        const parent = event.target.closest('.config-item');
        const id = parseInt(parent.dataset.id, 10);
        const field = event.target.dataset.field;
        this.updateRegionField(id, field, event.target.value);
      });
    });

    container.querySelectorAll('.remove-region-btn').forEach((button) => {
      button.addEventListener('click', () => this.removeRegion(parseInt(button.dataset.id, 10)));
    });
  }

  renderRoleSettings() {
    const container = document.getElementById('roleSettingsList');
    if (!container) return;
    if (!this.roles.length) {
      this.roles = Storage.getDefaultRoles();
      Storage.saveRoles(this.roles);
    }

    container.innerHTML = this.roles
      .map(
        (role) => `
          <div class="config-item roles" data-id="${role.id}">
            <input type="text" value="${this.escapeHtml(role.name)}" data-field="name" />
            <input type="number" value="${role.focus}" min="10" max="200" data-field="focus" />
            <button type="button" class="btn btn-small btn-secondary remove-role-btn" data-id="${role.id}">Remove</button>
          </div>
        `,
      )
      .join('');

    container.querySelectorAll('input').forEach((input) => {
      input.addEventListener('input', (event) => {
        const parent = event.target.closest('.config-item');
        const id = parseInt(parent.dataset.id, 10);
        const field = event.target.dataset.field;
        this.updateRoleField(id, field, event.target.value);
      });
    });

    container.querySelectorAll('.remove-role-btn').forEach((button) => {
      button.addEventListener('click', () => this.removeRole(parseInt(button.dataset.id, 10)));
    });
  }

  initBacklogToggle() {
    const dock = document.getElementById('backlogDock');
    const toggle = document.getElementById('toggleBacklogBtn');
    if (!dock) return;
    if (toggle) {
      toggle.addEventListener('click', () => {
        const collapsed = dock.classList.toggle('collapsed');
        toggle.textContent = collapsed ? 'Expand' : 'Collapse';
        dock.dataset.userToggled = 'true';
      });
    }

    dock.addEventListener('dragover', (event) => this.handleBacklogDockDragOver(event));
    dock.addEventListener('dragleave', (event) => this.handleBacklogDockDragLeave(event));
    dock.addEventListener('drop', (event) => this.handleBacklogDockDrop(event));
  }

  renderBacklog() {
    const dock = document.getElementById('backlogDock');
    const list = document.getElementById('backlogList');
    const countBadge = document.getElementById('backlogCount');
    if (!dock || !list || !countBadge) return;

    const backlog = this.getBacklogProjects();

    countBadge.textContent = backlog.length;

    if (!backlog.length) {
      list.innerHTML = '<p class="todo-empty">Nothing waiting — everything is placed! ✅</p>';
      dock.classList.add('collapsed');
      const toggle = document.getElementById('toggleBacklogBtn');
      if (toggle) toggle.textContent = 'Expand';
      delete dock.dataset.userToggled;
      return;
    }

    if (!dock.dataset.userToggled) {
      dock.classList.remove('collapsed');
      const toggle = document.getElementById('toggleBacklogBtn');
      if (toggle) toggle.textContent = 'Collapse';
    }

    list.innerHTML = backlog
      .map((project) => this.renderBacklogCard(project))
      .join('');

    const cards = list.querySelectorAll('.backlog-card');
    cards.forEach((card) => {
      card.setAttribute('draggable', 'true');
      card.addEventListener('dragstart', (event) => this.handleBacklogDragStart(event, card.dataset.id));
      card.addEventListener('dragend', () => this.handleBacklogDragEnd(card));
      card.addEventListener('click', () => {
        const project = this.projects.find((p) => p.id === parseInt(card.dataset.id, 10));
        if (project) this.openProjectModal(project);
      });
    });
  }

  getBacklogProjects() {
    return this.projects
      .filter((project) => !this.hasAssignee(project) || !this.isProjectScheduled(project))
      .sort((a, b) => (b.iceScore ?? 0) - (a.iceScore ?? 0));
  }

  renderBacklogCard(project) {
    const badges = [];
    if (!this.hasAssignee(project)) {
      badges.push('<span class="backlog-badge">No owner</span>');
    }
    if (!this.isProjectScheduled(project)) {
      badges.push('<span class="backlog-badge">No dates</span>');
    }
    badges.push(`<span class="backlog-badge">ICE ${this.formatIceScore(project.iceScore)}</span>`);
    if (project.mandayEstimate) {
      badges.push(`<span class="backlog-badge">${project.mandayEstimate} man-days</span>`);
    }
    const themeSlug = this.getProjectTheme(project);
    const themeLabel = this.getThemeLabel(themeSlug);

    return `
      <article class="backlog-card type-${themeSlug}" data-id="${project.id}">
        <div class="backlog-card-header">
          <h4>${this.escapeHtml(project.name)}</h4>
          <span class="theme-pill">${this.escapeHtml(themeLabel)}</span>
        </div>
        <div class="todo-meta">
          ${badges.join('')}
        </div>
        <p class="todo-hint">Drag to a teammate lane to schedule.</p>
      </article>
    `;
  }

  autoAllocateBacklog() {
    const backlog = this.getBacklogProjects();
    if (!backlog.length) {
      this.showToast('No backlog projects need scheduling', 'error');
      return;
    }
    if (!this.team.length) {
      this.showToast('Add team members before auto allocating', 'error');
      return;
    }

    const { start, end } = GanttChart.getQuarterRange(this.settings.currentQuarter);
    const rangeStart = new Date(start);
    const rangeEnd = new Date(end);
    if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) {
      this.showToast('Unable to determine quarter range for auto allocation', 'error');
      return;
    }

    const availability = this.buildTeamAvailability(rangeStart, rangeEnd);
    let scheduled = 0;

    // Sort backlog by priority (ICE score, then man-day estimate)
    const sortedBacklog = [...backlog].sort((a, b) => {
      // Higher ICE score = higher priority
      const iceA = a.iceScore ?? 0;
      const iceB = b.iceScore ?? 0;
      if (iceB !== iceA) return iceB - iceA;
      // Smaller projects first for better packing
      return (a.mandayEstimate ?? 0) - (b.mandayEstimate ?? 0);
    });

    sortedBacklog.forEach((project) => {
      if (this.allocateProjectFromAvailability(project, availability, rangeStart, rangeEnd)) {
        scheduled += 1;
      }
    });

    if (!scheduled) {
      this.showToast('Not enough capacity to auto-allocate backlog items', 'error');
      return;
    }

    Storage.saveProjects(this.projects);
    this.updateCapacityDisplay();
    this.refreshGantt();

    const remaining = backlog.length - scheduled;
    const suffix = remaining > 0 ? ` (${remaining} left in backlog)` : '';
    this.showToast(`Auto-allocated ${scheduled} project${scheduled === 1 ? '' : 's'}${suffix}`, 'success');
  }

  buildTeamAvailability(rangeStart, rangeEnd) {
    const availability = {};
    
    // Get company holidays in range
    const companyHolidayDates = this.getCompanyHolidayDatesInRange(rangeStart, rangeEnd);
    const companyHolidaySet = new Set(companyHolidayDates);
    
    this.team.forEach((member) => {
      // Get member's role for focus percentage
      const role = this.roles.find((r) => r.id === member.roleId);
      const focusPercent = (role?.focus ?? 100) / 100;
      
      // Get member's region for regional holidays (additional to company holidays)
      const region = this.regions.find((r) => r.id === member.regionId);
      const regionalHolidays = region?.holidays ?? 0;
      
      // Get member's PTO dates and combine with company holidays
      const ptoDates = Array.isArray(member.ptoDates) ? member.ptoDates : [];
      const unavailableDates = new Set([...ptoDates, ...companyHolidayDates]);
      
      // Calculate effective capacity for this member in the quarter
      const totalWorkingDays = this.countWorkingDaysForMember(rangeStart, rangeEnd, unavailableDates);
      const effectiveCapacity = Math.floor(totalWorkingDays * focusPercent) - regionalHolidays;
      
      availability[member.id] = {
        nextAvailable: this.clampToWorkingDayForMember(rangeStart, unavailableDates),
        load: 0,
        focusPercent,
        ptoDates: unavailableDates,
        effectiveCapacity: Math.max(0, effectiveCapacity),
        regionalHolidays,
        companyHolidays: companyHolidayDates.length,
      };
    });

    // Account for existing project assignments
    this.projects.forEach((project) => {
      if (!this.isProjectScheduled(project)) return;
      const startDate = new Date(project.startDate);
      const endDate = new Date(project.endDate);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return;
      const durationDays = this.countWorkingDays(startDate, endDate);
      const assignees = Array.isArray(project.assignees) ? project.assignees : [];
      const nextStart = this.getNextWorkingDay(endDate);
      assignees.forEach((assigneeId) => {
        if (!availability[assigneeId]) return;
        const memberAvail = availability[assigneeId];
        const nextAvailSkippingPto = this.clampToWorkingDayForMember(nextStart, memberAvail.ptoDates);
        if (nextAvailSkippingPto > memberAvail.nextAvailable) {
          memberAvail.nextAvailable = new Date(nextAvailSkippingPto);
        }
        memberAvail.load += durationDays;
      });
    });

    return availability;
  }

  // Count working days excluding weekends and member's PTO
  countWorkingDaysForMember(start, end, ptoSet) {
    const startDate = this.clampToWorkingDay(start);
    const endDate = end instanceof Date ? new Date(end) : new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
    if (startDate > endDate) return 0;
    const cursor = new Date(startDate);
    let count = 0;
    while (cursor <= endDate) {
      const dateStr = cursor.toISOString().split('T')[0];
      if (!this.isWeekend(cursor) && !ptoSet.has(dateStr)) {
        count += 1;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return Math.max(0, count);
  }

  // Clamp to next working day that's not PTO for this member
  clampToWorkingDayForMember(date, ptoSet) {
    const base = date instanceof Date ? new Date(date) : new Date(date);
    if (Number.isNaN(base.getTime())) return base;
    const copy = new Date(base);
    let iterations = 0;
    const maxIterations = 365; // Safety limit
    while (iterations < maxIterations) {
      const dateStr = copy.toISOString().split('T')[0];
      if (!this.isWeekend(copy) && !ptoSet.has(dateStr)) {
        return copy;
      }
      copy.setDate(copy.getDate() + 1);
      iterations++;
    }
    return copy;
  }

  // Add working days while skipping PTO dates
  addWorkingDaysForMember(start, workingDays, ptoSet) {
    const base = start instanceof Date ? new Date(start) : new Date(start);
    if (Number.isNaN(base.getTime())) return base;
    if (workingDays <= 1) {
      return this.clampToWorkingDayForMember(base, ptoSet);
    }
    const result = this.clampToWorkingDayForMember(base, ptoSet);
    let remaining = workingDays - 1;
    let iterations = 0;
    const maxIterations = 365 * 2; // Safety limit
    while (remaining > 0 && iterations < maxIterations) {
      result.setDate(result.getDate() + 1);
      const dateStr = result.toISOString().split('T')[0];
      if (!this.isWeekend(result) && !ptoSet.has(dateStr)) {
        remaining -= 1;
      }
      iterations++;
    }
    return result;
  }

  allocateProjectFromAvailability(project, availability, rangeStart, rangeEnd) {
    const entries = Object.entries(availability).map(([memberId, meta]) => ({
      memberId: parseInt(memberId, 10),
      nextAvailable: meta.nextAvailable,
      load: meta.load,
      focusPercent: meta.focusPercent,
      ptoDates: meta.ptoDates,
      effectiveCapacity: meta.effectiveCapacity,
    })).filter((entry) => Number.isInteger(entry.memberId));
    if (!entries.length) return false;

    const requiredDays = this.estimateProjectDurationDays(project);

    // Score each team member based on multiple factors
    const rangeMs = Math.max(1, rangeEnd - rangeStart);
    entries.forEach((entry) => {
      // Calculate remaining capacity for this member
      const remainingCapacity = Math.max(0, entry.effectiveCapacity - entry.load);
      
      // Can they fit this project?
      entry.canFit = remainingCapacity >= requiredDays;
      
      // Availability score: how soon can they start (0 = now, 1 = end of quarter)
      const availabilityOffset = Math.max(0, entry.nextAvailable - rangeStart);
      const normalizedAvailability = availabilityOffset / rangeMs;
      
      // Load balance score: what % of their capacity is used (0 = empty, 1 = full)
      const capacityUtilization = entry.effectiveCapacity > 0 
        ? entry.load / entry.effectiveCapacity 
        : 1;
      
      // Focus penalty: prefer full-time ICs over managers with split focus
      const focusPenalty = 1 - entry.focusPercent;
      
      // Type preference score: how much does this member want this type of work?
      // Returns: loved=-0.2, preferred=-0.1, neutral=0, avoided=0.15, disliked=0.3
      const typePreferenceScore = this.getTypePreferenceScore(entry.memberId, project.type);
      
      // Composite score (lower is better):
      // - 30% weight to availability (prefer sooner start)
      // - 35% weight to load balance (prefer less loaded members)
      // - 15% weight to focus (prefer dedicated team members)
      // - 20% weight to type preference (prefer members who enjoy this work)
      entry.score = (normalizedAvailability * 0.30) + 
                   (capacityUtilization * 0.35) + 
                   (focusPenalty * 0.15) +
                   (typePreferenceScore * 0.20);
      
      // Heavy penalty if they can't fit the project
      if (!entry.canFit) {
        entry.score += 10;
      }
    });
    
    // Sort by score (lowest first = best candidate)
    entries.sort((a, b) => a.score - b.score);

    for (const entry of entries) {
      const startCandidate = entry.nextAvailable > rangeStart ? new Date(entry.nextAvailable) : new Date(rangeStart);
      const start = this.clampToWorkingDayForMember(startCandidate, entry.ptoDates);
      
      // Adjust required days based on focus percentage (part-time = longer duration)
      const adjustedDays = Math.ceil(requiredDays / entry.focusPercent);
      const end = this.addWorkingDaysForMember(start, adjustedDays, entry.ptoDates);
      
      if (end.getTime() > rangeEnd.getTime()) {
        continue;
      }
      
      this.applyAutoAllocation(project, entry.memberId, start, end);
      
      // Update availability for next iteration
      const nextAvail = this.getNextWorkingDay(end);
      availability[entry.memberId].nextAvailable = this.clampToWorkingDayForMember(nextAvail, entry.ptoDates);
      availability[entry.memberId].load += requiredDays;
      return true;
    }

    return false;
  }

  applyAutoAllocation(project, memberId, startDate, endDate) {
    const index = this.projects.findIndex((p) => p.id === project.id);
    if (index === -1) return;
    const updated = {
      ...this.projects[index],
      assignees: [memberId],
      startDate: this.formatDateInput(startDate),
      endDate: this.formatDateInput(endDate),
    };
    this.projects[index] = updated;
    project.assignees = updated.assignees;
    project.startDate = updated.startDate;
    project.endDate = updated.endDate;
  }

  handleBacklogDragStart(event, projectId) {
    const card = event.currentTarget;
    card.classList.add('dragging');
    const preview = this.createDragPreview(card);
    if (preview && event.dataTransfer?.setDragImage) {
      event.dataTransfer.setDragImage(preview.node, preview.width / 2, preview.height / 2);
    }
    event.dataTransfer.setData(this.backlogDragMime, projectId);
    event.dataTransfer.setData('text/plain', projectId);
    event.dataTransfer.effectAllowed = 'copy';
  }

  handleBacklogDragEnd(card) {
    card.classList.remove('dragging');
    this.removeDragPreview();
  }

  handleBacklogDockDragOver(event) {
    if (!this.isUnscheduleDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    document.getElementById('backlogDock')?.classList.add('drop-target');
  }

  handleBacklogDockDragLeave(event) {
    if (!this.isUnscheduleDrag(event)) return;
    const currentTarget = event.currentTarget;
    if (currentTarget && event.relatedTarget && currentTarget.contains(event.relatedTarget)) {
      return;
    }
    this.clearBacklogDockHighlight();
  }

  handleBacklogDockDrop(event) {
    if (!this.isUnscheduleDrag(event)) return;
    event.preventDefault();
    this.clearBacklogDockHighlight();
    const rawId = event.dataTransfer.getData(this.backlogUnscheduleMime);
    const projectId = parseInt(rawId || event.dataTransfer.getData(this.backlogDragMime), 10);
    if (!Number.isInteger(projectId)) return;
    this.sendProjectToBacklog(projectId);
  }

  clearBacklogDockHighlight() {
    document.getElementById('backlogDock')?.classList.remove('drop-target');
  }

  isUnscheduleDrag(event) {
    const types = Array.from(event.dataTransfer?.types || []);
    return types.includes(this.backlogUnscheduleMime);
  }

  isProjectScheduled(project) {
    const hasStart = Boolean(project.startDate);
    const hasEnd = Boolean(project.endDate);
    if (!hasStart || !hasEnd) return false;
    const start = new Date(project.startDate);
    const end = new Date(project.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
    return start <= end;
  }

  hasAssignee(project) {
    return Array.isArray(project.assignees) && project.assignees.length > 0;
  }

  getAssigneeNames(project) {
    const assigneeList = Array.isArray(project.assignees) ? project.assignees : [];
    if (!assigneeList.length) return 'Unassigned';
    return assigneeList
      .map((id) => this.team.find((member) => member.id === id)?.name || 'Unknown')
      .join(', ');
  }

  placeBacklogProject(projectId, assigneeId, anchorDate) {
    const index = this.projects.findIndex((project) => project.id === projectId);
    if (index === -1) return;
    const project = this.projects[index];
    const startDate = this.formatDateInput(anchorDate);
    const endDate = this.calculateBacklogEndDate(anchorDate, project);
    if (!startDate || !endDate) return;
    const assignees = new Set(Array.isArray(project.assignees) ? project.assignees : []);
    if (Number.isInteger(assigneeId)) {
      assignees.add(assigneeId);
    }

    const updated = {
      ...project,
      startDate,
      endDate,
      assignees: Array.from(assignees),
    };

    this.projects[index] = updated;
    Storage.saveProjects(this.projects);
    this.updateCapacityDisplay();
    this.refreshGantt();
    this.renderBacklog();

    const memberName = this.team.find((member) => member.id === assigneeId)?.name;
    this.showToast(
      memberName ? `Scheduled with ${memberName}` : 'Project scheduled',
      'success',
    );
  }

  sendCurrentProjectToBacklog() {
    if (this.currentProject?.id) {
      this.sendProjectToBacklog(this.currentProject.id);
      this.closeProjectModal();
      return;
    }
    this.clearAssigneesInModal();
    this.clearDatesInModal();
    this.showToast('Cleared owners and dates. Save to keep in backlog.', 'success');
  }

  sendProjectToBacklog(projectId, { clearAssignees = true, announce = true } = {}) {
    const index = this.projects.findIndex((project) => project.id === projectId);
    if (index === -1) return;
    const project = this.projects[index];
    const updated = {
      ...project,
      startDate: '',
      endDate: '',
      assignees: clearAssignees ? [] : Array.isArray(project.assignees) ? project.assignees : [],
    };
    this.projects[index] = updated;
    Storage.saveProjects(this.projects);
    this.updateCapacityDisplay();
    this.refreshGantt();
    this.renderBacklog();
    if (announce) {
      this.showToast('Returned to backlog dock', 'success');
    }
  }

  resetBoardToBacklog() {
    if (!this.projects.length) {
      this.showToast('No projects to reset', 'error');
      return;
    }
    this.projects = this.projects.map((project) => ({
      ...project,
      startDate: '',
      endDate: '',
      assignees: [],
    }));
    Storage.saveProjects(this.projects);
    this.updateCapacityDisplay();
    this.refreshGantt();
    this.renderBacklog();
    this.showToast('Board reset: all projects returned to backlog', 'success');
  }

  calculateBacklogEndDate(anchorDate, project = null) {
    if (!(anchorDate instanceof Date) || Number.isNaN(anchorDate.getTime())) return '';
    const durationDays = project ? this.estimateProjectDurationDays(project) : this.backlogDurationDays;
    const safeAnchor = this.clampToWorkingDay(anchorDate);
    const end = this.addWorkingDays(safeAnchor, Math.max(1, durationDays));
    return this.formatDateInput(end);
  }

  initIceInputs() {
    if (this.iceInputsBound) return;
    const { impactInput, confidenceInput, effortInput } = this.getIceElements();
    if (!impactInput || !confidenceInput || !effortInput) return;
    [impactInput, confidenceInput, effortInput].forEach((input) => {
      input.addEventListener('input', () => this.updateIcePreview());
    });
    this.iceInputsBound = true;
    this.updateIcePreview();
  }

  getIceElements() {
    return {
      impactInput: document.getElementById('projectImpact'),
      confidenceInput: document.getElementById('projectConfidenceScore'),
      effortInput: document.getElementById('projectEffort'),
      scoreDisplay: document.getElementById('projectIceScore'),
    };
  }

  normalizeIceValue(value) {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed)) return 1;
    return Math.max(1, Math.min(10, parsed));
  }

  normalizeManDayEstimate(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const rounded = Math.round(value);
      return rounded > 0 ? Math.min(rounded, 2000) : null;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Math.round(parseFloat(value));
      if (Number.isNaN(parsed)) return null;
      return parsed > 0 ? Math.min(parsed, 2000) : null;
    }
    return null;
  }

  parseOptionalNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number.parseFloat(value);
      return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
  }

  calculateIceScore(impact, confidenceValue, effort) {
    const safeImpact = this.normalizeIceValue(impact);
    const safeConfidence = this.normalizeIceValue(confidenceValue);
    const safeEffort = Math.max(1, Math.min(10, parseInt(effort, 10) || 1));
    const score = (safeImpact * safeConfidence) / safeEffort;
    return Math.round(score * 10) / 10;
  }

  estimateStoryPoints(effort, confidence = 5, existingPoints = null) {
    if (typeof existingPoints === 'number' && existingPoints > 0) {
      return existingPoints;
    }
    const safeEffort = this.normalizeIceValue(effort ?? 5);
    const safeConfidence = this.normalizeIceValue(confidence ?? 5);
    const anchors = [
      { effort: 1, points: 1 },
      { effort: 2, points: 2 },
      { effort: 3, points: 3 },
      { effort: 4, points: 5 },
      { effort: 6, points: 8 },
      { effort: 8, points: 13 },
      { effort: 9, points: 20 },
      { effort: 10, points: 40 },
    ];
    for (let i = 0; i < anchors.length - 1; i += 1) {
      const current = anchors[i];
      const next = anchors[i + 1];
      if (safeEffort >= current.effort && safeEffort <= next.effort) {
        const range = next.effort - current.effort || 1;
        const ratio = (safeEffort - current.effort) / range;
        const interpolated = current.points + ratio * (next.points - current.points);
        const adjusted = interpolated * this.getConfidenceMultiplier(safeConfidence);
        return Math.max(1, Math.round(adjusted));
      }
    }
    const adjusted = anchors[anchors.length - 1].points * this.getConfidenceMultiplier(safeConfidence);
    return Math.max(1, Math.round(adjusted));
  }

  getProjectStoryPoints(project) {
    if (!project) {
      return this.estimateStoryPoints(5, 5);
    }
    if (typeof project.storyPoints === 'number' && project.storyPoints > 0) {
      return project.storyPoints;
    }
    const calculated = this.estimateStoryPoints(project.iceEffort ?? 5, project.iceConfidence ?? 5);
    project.storyPoints = calculated;
    return calculated;
  }

  estimateProjectDurationDays(project = null) {
    const normalizedMandays = this.normalizeManDayEstimate(project?.mandayEstimate);
    if (normalizedMandays) {
      return Math.max(this.minAutoScheduleDays, normalizedMandays);
    }
    const storyPoints = this.getProjectStoryPoints(project);
    const derived = Math.round(storyPoints * this.storyPointDayRatio);
    if (!Number.isFinite(derived) || derived <= 0) {
      return Math.max(this.minAutoScheduleDays, this.backlogDurationDays);
    }
    return Math.max(this.minAutoScheduleDays, derived);
  }

  getConfidenceMultiplier(confidence) {
    const safe = this.normalizeIceValue(confidence ?? 5);
    const deficitRatio = (10 - safe) / 10; // 0 when confidence=10, 0.9 when confidence=1
    const maxPenalty = 0.5; // up to +50% scope when confidence is very low
    return 1 + deficitRatio * maxPenalty;
  }

  updateIcePreview() {
    const { impactInput, confidenceInput, effortInput, scoreDisplay } = this.getIceElements();
    if (!impactInput || !confidenceInput || !effortInput || !scoreDisplay) return;
    const score = this.calculateIceScore(
      impactInput.value,
      confidenceInput.value,
      effortInput.value,
    );
    scoreDisplay.textContent = this.formatIceScore(score);
  }

  formatIceScore(score) {
    if (typeof score !== 'number' || Number.isNaN(score)) return '—';
    return score % 1 === 0 ? score.toFixed(0) : score.toFixed(1);
  }

  getProjectTheme(project) {
    const fallback = 'feature';
    if (!project) return fallback;
    const raw = typeof project.type === 'string' ? project.type.trim().toLowerCase() : '';
    const slug = raw.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return slug || fallback;
  }

  getTaskTypes() {
    return [
      { id: 'feature', name: 'Feature', icon: '✨', color: '#f92672' },
      { id: 'bug-fix', name: 'Bug Fix', icon: '🐛', color: '#fd971f' },
      { id: 'tech-debt', name: 'Tech Debt', icon: '🔧', color: '#ae81ff' },
      { id: 'infrastructure', name: 'Infrastructure', icon: '🏗️', color: '#66d9ef' },
      { id: 'research', name: 'Research', icon: '🔬', color: '#a6e22e' },
      { id: 'security', name: 'Security', icon: '🔒', color: '#ff5555' },
      { id: 'performance', name: 'Performance', icon: '⚡', color: '#ffb86c' },
      { id: 'documentation', name: 'Documentation', icon: '📝', color: '#8be9fd' },
      { id: 'testing', name: 'Testing', icon: '🧪', color: '#50fa7b' },
      { id: 'design', name: 'Design', icon: '🎨', color: '#ff79c6' },
      { id: 'support', name: 'Support', icon: '🎧', color: '#e6db74' },
      { id: 'ops', name: 'Operations', icon: '⚙️', color: '#75715e' },
      { id: 'maintenance', name: 'Maintenance', icon: '🛠️', color: '#5c5952' },
      { id: 'integration', name: 'Integration', icon: '🔗', color: '#bd93f9' },
      { id: 'migration', name: 'Migration', icon: '📦', color: '#6272a4' },
    ];
  }

  getTypePreferenceScore(memberId, projectType) {
    const member = this.team.find(m => m.id === memberId);
    if (!member || !member.typePreferences) return 0;
    
    const pref = member.typePreferences[projectType];
    // Returns normalized score where negative = good, positive = bad (for scoring system)
    // loved = -1 (strong preference), preferred = -0.5, neutral = 0, avoided = 0.75, disliked = 1.5
    switch (pref) {
      case 'loved': return -1;
      case 'preferred': return -0.5;
      case 'avoided': return 0.75;
      case 'disliked': return 1.5;
      default: return 0;
    }
  }

  getThemeLabel(theme) {
    const taskTypes = this.getTaskTypes();
    const found = taskTypes.find(t => t.id === theme);
    if (found) return found.name;
    
    // Fallback for custom types
    return theme
      .split('-')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  renderMemberBreakdown(members = []) {
    const container = document.getElementById('memberBreakdownList');
    if (!container) return;
    if (!members.length) {
      container.innerHTML = '<p class="member-breakdown-empty">Add regions & roles to see per-person rollups.</p>';
      return;
    }

    const header = `
      <div class="member-breakdown-header">
        <span>Name</span>
        <span>Region</span>
        <span>Role</span>
        <span>Focus days</span>
        <span>Time off</span>
        <span>Net</span>
      </div>
    `;

    const rows = members
      .map(
        (member) => `
          <div class="member-row">
            <span>${this.escapeHtml(member.name)}</span>
            <span>${this.escapeHtml(member.region || 'N/A')}</span>
            <span>${this.escapeHtml(member.role || 'N/A')}</span>
            <span>${member.theoretical}</span>
            <span>-${member.timeOff}</span>
            <span>${member.net}</span>
          </div>
        `,
      )
      .join('');

    container.innerHTML = header + rows;
  }

  addRegion() {
    const id = Date.now();
    this.regions.push({ id, name: 'New Region', ptoDays: 10, holidays: 5 });
    Storage.saveRegions(this.regions);
    this.renderRegionSettings();
    this.recalculateCapacity();
    this.renderTeamMembersList();
  }

  addRole() {
    const id = Date.now();
    this.roles.push({ id, name: 'New Role', focus: 100 });
    Storage.saveRoles(this.roles);
    this.renderRoleSettings();
    this.recalculateCapacity();
    this.renderTeamMembersList();
  }

  removeRegion(id) {
    if (this.regions.length <= 1) {
      this.showToast('At least one region is required', 'error');
      return;
    }
    if (this.team.some((member) => member.regionId === id)) {
      this.showToast('Reassign affected team members before removing this region', 'error');
      return;
    }
    this.regions = this.regions.filter((region) => region.id !== id);
    Storage.saveRegions(this.regions);
    this.renderRegionSettings();
    this.recalculateCapacity();
  }

  removeRole(id) {
    if (this.roles.length <= 1) {
      this.showToast('At least one role is required', 'error');
      return;
    }
    if (this.team.some((member) => member.roleId === id)) {
      this.showToast('Reassign affected team members before removing this role', 'error');
      return;
    }
    this.roles = this.roles.filter((role) => role.id !== id);
    Storage.saveRoles(this.roles);
    this.renderRoleSettings();
    this.recalculateCapacity();
  }

  updateRegionField(id, field, rawValue) {
    this.regions = this.regions.map((region) => {
      if (region.id !== id) return region;
      let value = rawValue;
      if (field !== 'name') {
        value = Math.max(0, parseInt(rawValue, 10) || 0);
      }
      return { ...region, [field]: value };
    });
    Storage.saveRegions(this.regions);
    this.renderTeamMembersList();
    this.recalculateCapacity();
  }

  updateRoleField(id, field, rawValue) {
    this.roles = this.roles.map((role) => {
      if (role.id !== id) return role;
      let value = rawValue;
      if (field === 'focus') {
        value = Math.min(200, Math.max(10, parseInt(rawValue, 10) || 0));
      }
      return { ...role, [field]: value };
    });
    Storage.saveRoles(this.roles);
    this.renderTeamMembersList();
    this.recalculateCapacity();
  }

  populateAssigneeSelect() {
    const select = document.getElementById('projectAssignee');
    if (!select) return;
    select.innerHTML = '<option value="">— Select assignee —</option>' +
      this.team
        .map((member) => `<option value="${member.id}">${this.escapeHtml(member.name)}</option>`)
        .join('');
  }

  handleEngineerCountChange() {
    const input = document.getElementById('numEngineers');
    if (!input) return;
    let value = parseInt(input.value, 10);
    if (Number.isNaN(value)) value = this.team.length || 1;
    value = Math.min(Math.max(value, 1), 50);
    input.value = value;
    this.updateTeamSize(value);
    this.renderTeamMembersList();
    this.populateAssigneeSelect();
    this.recalculateCapacity();
    this.refreshGantt();
  }

  addTeamMember() {
    const nextId = this.team.length ? Math.max(...this.team.map((member) => member.id)) + 1 : 1;
    const memberName = `Team Member ${nextId}`;
    const member = {
      id: nextId,
      name: memberName,
      avatar: this.getInitials(memberName),
      regionId: this.team[0]?.regionId ?? this.regions[0]?.id ?? null,
      roleId: this.team[0]?.roleId ?? this.roles[0]?.id ?? null,
      color: this.generateMemberColor(memberName),
    };
    this.team.push(member);
    Storage.saveTeam(this.team);
    const engineersInput = document.getElementById('numEngineers');
    if (engineersInput) engineersInput.value = this.team.length;
    this.populateAssigneeSelect();
    this.renderTeamMembersList();
    this.recalculateCapacity();
    this.refreshGantt();
  }

  removeTeamMember(id) {
    if (this.team.length <= 1) {
      this.showToast('At least one team member is required', 'error');
      return;
    }
    this.team = this.team.filter((member) => member.id !== id);
    const engineersInput = document.getElementById('numEngineers');
    if (engineersInput) engineersInput.value = this.team.length;
    this.projects = this.projects.map((project) => {
      const assignees = Array.isArray(project.assignees) ? project.assignees : [];
      return {
        ...project,
        assignees: assignees.filter((assigneeId) => assigneeId !== id),
      };
    });
    Storage.saveProjects(this.projects);
    Storage.saveTeam(this.team);
    this.populateAssigneeSelect();
    this.renderTeamMembersList();
    this.updateCapacityDisplay();
    this.refreshGantt();
  }

  // PTO Management
  currentPtoMemberId = null;

  openPtoModal(memberId) {
    const member = this.team.find((m) => m.id === memberId);
    if (!member) {
      this.showToast('Team member not found', 'error');
      return;
    }
    this.currentPtoMemberId = memberId;
    const modal = document.getElementById('ptoModal');
    const title = document.getElementById('ptoModalTitle');
    if (title) title.textContent = `📅 PTO for ${member.name}`;
    this.renderPtoDates(member.ptoDates || []);
    modal?.classList.add('active');
  }

  closePtoModal() {
    document.getElementById('ptoModal')?.classList.remove('active');
    this.currentPtoMemberId = null;
  }

  renderPtoDates(dates) {
    const container = document.getElementById('ptoDatesListContainer');
    if (!container) return;
    
    if (!dates.length) {
      container.innerHTML = '<p class="form-hint">No PTO dates scheduled.</p>';
      return;
    }
    
    const sortedDates = [...dates].sort();
    container.innerHTML = sortedDates.map((date) => `
      <div class="pto-date-item">
        <span>${new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
        <button type="button" class="btn btn-small btn-secondary remove-pto-btn" data-date="${date}">✕</button>
      </div>
    `).join('');
    
    container.querySelectorAll('.remove-pto-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.removePtoDate(btn.dataset.date));
    });
  }

  addPtoDate() {
    const input = document.getElementById('ptoDateInput');
    if (!input || !input.value) {
      this.showToast('Please select a date', 'error');
      return;
    }
    
    const member = this.team.find((m) => m.id === this.currentPtoMemberId);
    if (!member) return;
    
    if (!Array.isArray(member.ptoDates)) {
      member.ptoDates = [];
    }
    
    const dateStr = input.value;
    if (member.ptoDates.includes(dateStr)) {
      this.showToast('Date already added', 'error');
      return;
    }
    
    member.ptoDates.push(dateStr);
    Storage.saveTeam(this.team);
    this.renderPtoDates(member.ptoDates);
    this.renderTeamMembersList();
    input.value = '';
    this.showToast('PTO date added', 'success');
  }

  removePtoDate(dateStr) {
    const member = this.team.find((m) => m.id === this.currentPtoMemberId);
    if (!member || !Array.isArray(member.ptoDates)) return;
    
    member.ptoDates = member.ptoDates.filter((d) => d !== dateStr);
    Storage.saveTeam(this.team);
    this.renderPtoDates(member.ptoDates);
    this.renderTeamMembersList();
  }

  // Type Preferences Management
  openTypePreferencesModal(memberId) {
    const member = this.team.find((m) => m.id === memberId);
    if (!member) {
      this.showToast('Team member not found', 'error');
      return;
    }
    this.currentTypePrefsMemberId = memberId;
    const modal = document.getElementById('typePreferencesModal');
    const title = document.getElementById('typePreferencesModalTitle');
    if (title) title.textContent = `🎯 Task Preferences for ${member.name}`;
    this.renderTypePreferences(member.typePreferences || {});
    modal?.classList.add('active');
  }

  closeTypePreferencesModal() {
    document.getElementById('typePreferencesModal')?.classList.remove('active');
    this.currentTypePrefsMemberId = null;
  }

  renderTypePreferences(preferences) {
    const container = document.getElementById('typePreferencesList');
    if (!container) return;
    
    const taskTypes = this.getTaskTypes();
    const preferenceOptions = [
      { value: 'loved', label: '❤️ Love it', class: 'preference-level-loved' },
      { value: 'preferred', label: '👍 Prefer', class: 'preference-level-preferred' },
      { value: 'neutral', label: '😐 Neutral', class: 'preference-level-neutral' },
      { value: 'avoided', label: '👎 Avoid', class: 'preference-level-avoided' },
      { value: 'disliked', label: '❌ Dislike', class: 'preference-level-disliked' }
    ];
    
    container.innerHTML = taskTypes.map((type) => {
      const currentPref = preferences[type.value] || 'neutral';
      const optionsHtml = preferenceOptions.map((opt) => 
        `<option value="${opt.value}" ${currentPref === opt.value ? 'selected' : ''}>${opt.label}</option>`
      ).join('');
      
      return `
        <div class="type-preference-item" data-type="${type.value}">
          <span class="type-preference-icon">${type.icon}</span>
          <span class="type-preference-label">${type.label}</span>
          <select class="type-preference-select" data-type="${type.value}">
            ${optionsHtml}
          </select>
        </div>
      `;
    }).join('');
    
    container.querySelectorAll('.type-preference-select').forEach((select) => {
      select.addEventListener('change', (e) => {
        this.updateTypePreference(e.target.dataset.type, e.target.value);
      });
    });
  }

  updateTypePreference(typeValue, preference) {
    const member = this.team.find((m) => m.id === this.currentTypePrefsMemberId);
    if (!member) return;
    
    if (!member.typePreferences) {
      member.typePreferences = {};
    }
    
    if (preference === 'neutral') {
      delete member.typePreferences[typeValue];
    } else {
      member.typePreferences[typeValue] = preference;
    }
    
    Storage.saveTeam(this.team);
  }

  saveTypePreferences() {
    this.closeTypePreferencesModal();
    this.renderTeamMembersList();
    this.showToast('Preferences saved', 'success');
  }

  // Company Holidays Management
  openHolidaysModal() {
    // Set country code from settings
    const countrySelect = document.getElementById('countryCodeSelect');
    if (countrySelect && this.settings.countryCode) {
      countrySelect.value = this.settings.countryCode;
    }
    
    // Set year to current or next year
    const yearInput = document.getElementById('holidayYearInput');
    if (yearInput) {
      const currentYear = new Date().getFullYear();
      yearInput.value = currentYear;
    }
    
    this.renderCompanyHolidays();
    document.getElementById('holidaysModal')?.classList.add('active');
  }

  async fetchPublicHolidays() {
    const countrySelect = document.getElementById('countryCodeSelect');
    const yearInput = document.getElementById('holidayYearInput');
    const fetchBtn = document.getElementById('fetchHolidaysBtn');
    
    const countryCode = countrySelect?.value || 'US';
    const year = parseInt(yearInput?.value, 10) || new Date().getFullYear();
    
    // Save country code to settings
    this.settings.countryCode = countryCode;
    Storage.saveSettings(this.settings);
    
    // Disable button during fetch
    if (fetchBtn) {
      fetchBtn.disabled = true;
      fetchBtn.textContent = '⏳ Fetching...';
    }
    
    try {
      const response = await fetch(`https://date.nager.at/api/v3/publicholidays/${year}/${countryCode}`);
      
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }
      
      const holidays = await response.json();
      
      if (!Array.isArray(holidays) || holidays.length === 0) {
        this.showToast('No holidays found for this country/year', 'error');
        return;
      }
      
      // Filter to only public holidays (type includes 'Public')
      const publicHolidays = holidays.filter(h => 
        Array.isArray(h.types) && h.types.includes('Public')
      );
      
      // Get existing holiday dates to avoid duplicates
      const existingDates = new Set(this.companyHolidays.map(h => h.date));
      
      // Add new holidays
      let addedCount = 0;
      publicHolidays.forEach((holiday) => {
        if (!existingDates.has(holiday.date)) {
          this.companyHolidays.push({
            date: holiday.date,
            name: holiday.name || holiday.localName || 'Public Holiday',
          });
          addedCount += 1;
        }
      });
      
      if (addedCount === 0) {
        this.showToast('All holidays already exist', 'success');
      } else {
        Storage.saveCompanyHolidays(this.companyHolidays);
        this.renderCompanyHolidays();
        this.showToast(`Added ${addedCount} public holiday${addedCount !== 1 ? 's' : ''}`, 'success');
      }
      
    } catch (error) {
      console.error('Failed to fetch holidays:', error);
      this.showToast('Failed to fetch holidays. Check your connection.', 'error');
    } finally {
      if (fetchBtn) {
        fetchBtn.disabled = false;
        fetchBtn.textContent = '🌐 Fetch';
      }
    }
  }

  closeHolidaysModal() {
    document.getElementById('holidaysModal')?.classList.remove('active');
    this.updateCompanyHolidaysCount();
    this.recalculateCapacity();
  }

  updateCompanyHolidaysCount() {
    const countEl = document.getElementById('companyHolidaysCount');
    if (countEl) {
      const count = this.companyHolidays.length;
      countEl.textContent = `${count} day${count !== 1 ? 's' : ''} configured`;
    }
  }

  renderCompanyHolidays() {
    const container = document.getElementById('holidaysListContainer');
    const countEl = document.getElementById('holidayCount');
    if (!container) return;
    
    if (countEl) countEl.textContent = this.companyHolidays.length;
    
    if (!this.companyHolidays.length) {
      container.innerHTML = '<p class="form-hint">No company holidays configured.</p>';
      return;
    }
    
    const sortedHolidays = [...this.companyHolidays].sort((a, b) => a.date.localeCompare(b.date));
    container.innerHTML = sortedHolidays.map((holiday) => `
      <div class="holiday-item">
        <div class="holiday-item-info">
          <span class="holiday-item-date">${new Date(holiday.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
          <span class="holiday-item-name">${this.escapeHtml(holiday.name)}</span>
        </div>
        <button type="button" class="btn btn-small btn-secondary remove-holiday-btn" data-date="${holiday.date}">✕</button>
      </div>
    `).join('');
    
    container.querySelectorAll('.remove-holiday-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.removeCompanyHoliday(btn.dataset.date));
    });
  }

  addCompanyHoliday() {
    const dateInput = document.getElementById('holidayDateInput');
    const nameInput = document.getElementById('holidayNameInput');
    
    if (!dateInput || !dateInput.value) {
      this.showToast('Please select a date', 'error');
      return;
    }
    
    const dateStr = dateInput.value;
    const name = nameInput?.value?.trim() || 'Company Holiday';
    
    if (this.companyHolidays.some((h) => h.date === dateStr)) {
      this.showToast('This date is already a holiday', 'error');
      return;
    }
    
    this.companyHolidays.push({ date: dateStr, name });
    Storage.saveCompanyHolidays(this.companyHolidays);
    this.renderCompanyHolidays();
    dateInput.value = '';
    if (nameInput) nameInput.value = '';
    this.showToast('Holiday added', 'success');
  }

  removeCompanyHoliday(dateStr) {
    this.companyHolidays = this.companyHolidays.filter((h) => h.date !== dateStr);
    Storage.saveCompanyHolidays(this.companyHolidays);
    this.renderCompanyHolidays();
  }

  // ========================================
  // Spreadsheet Modal Methods
  // ========================================

  openSpreadsheetModal() {
    document.getElementById('spreadsheetModal')?.classList.add('active');
    this.initSpreadsheet();
  }

  closeSpreadsheetModal() {
    document.getElementById('spreadsheetModal')?.classList.remove('active');
    if (this.spreadsheetInstance) {
      this.spreadsheetInstance.destroy();
      this.spreadsheetInstance = null;
    }
  }

  initSpreadsheet() {
    const container = document.getElementById('spreadsheetContainer');
    if (!container) return;

    // Destroy existing instance
    if (this.spreadsheetInstance) {
      this.spreadsheetInstance.destroy();
    }

    // Prepare data for spreadsheet
    const data = this.projects.map((project) => {
      const assigneeNames = (project.assignees || [])
        .map((id) => this.team.find((m) => m.id === id)?.name || '')
        .filter(Boolean)
        .join(', ');
      
      return [
        project.id,           // 0: Hidden ID
        project.name,         // 1: Name
        project.type,         // 2: Type
        project.status,       // 3: Status
        assigneeNames,        // 4: Assignees
        project.startDate,    // 5: Start Date
        project.endDate,      // 6: End Date
        project.mandayEstimate || '', // 7: Man-days
        project.confidence,   // 8: Confidence
        project.iceImpact || 5,    // 9: Impact
        project.iceConfidence || 5, // 10: Confidence (ICE)
        project.iceEffort || 5,    // 11: Effort
        project.description || '', // 12: Description
      ];
    });

    // Build assignee options
    const assigneeOptions = this.team.map((m) => m.name);

    // Build type options
    const taskTypes = this.getTaskTypes();
    const typeOptions = taskTypes.map((t) => t.id);

    // Column definitions
    const columns = [
      { type: 'hidden', title: 'ID', width: 50, readOnly: true },
      { type: 'text', title: 'Project Name', width: 200 },
      { type: 'dropdown', title: 'Type', width: 120, source: typeOptions },
      { type: 'dropdown', title: 'Status', width: 110, source: ['planned', 'in-progress', 'at-risk', 'blocked', 'completed'] },
      { type: 'dropdown', title: 'Assignees', width: 150, source: assigneeOptions, autocomplete: true, multiple: true },
      { type: 'calendar', title: 'Start Date', width: 110, options: { format: 'YYYY-MM-DD' } },
      { type: 'calendar', title: 'End Date', width: 110, options: { format: 'YYYY-MM-DD' } },
      { type: 'numeric', title: 'Man-days', width: 80 },
      { type: 'dropdown', title: 'Confidence', width: 100, source: ['high', 'medium', 'low'] },
      { type: 'numeric', title: 'Impact', width: 70 },
      { type: 'numeric', title: 'ICE Conf.', width: 70 },
      { type: 'numeric', title: 'Effort', width: 70 },
      { type: 'text', title: 'Description', width: 250 },
    ];

    // Initialize jspreadsheet
    this.spreadsheetInstance = jspreadsheet(container, {
      data: data.length > 0 ? data : [['', '', 'feature', 'planned', '', '', '', '', 'medium', 5, 5, 5, '']],
      columns: columns,
      minDimensions: [13, 1],
      tableOverflow: true,
      tableWidth: '100%',
      tableHeight: '100%',
      columnSorting: true,
      columnDrag: true,
      columnResize: true,
      rowResize: true,
      search: true,
      pagination: 50,
      paginationOptions: [10, 25, 50, 100],
      allowInsertRow: true,
      allowDeleteRow: true,
      allowInsertColumn: false,
      allowDeleteColumn: false,
      contextMenu: (obj, x, y, e) => {
        const items = [];
        if (y !== null) {
          items.push({
            title: 'Insert row above',
            onclick: () => obj.insertRow(1, y, true)
          });
          items.push({
            title: 'Insert row below',
            onclick: () => obj.insertRow(1, y, false)
          });
          items.push({
            title: 'Delete row',
            onclick: () => obj.deleteRow(y)
          });
        }
        items.push({
          title: 'Copy',
          shortcut: 'Ctrl+C',
          onclick: () => obj.copy()
        });
        items.push({
          title: 'Paste',
          shortcut: 'Ctrl+V',
          onclick: () => obj.paste()
        });
        return items;
      }
    });
  }

  addSpreadsheetRow() {
    if (!this.spreadsheetInstance) return;
    const newId = Date.now();
    this.spreadsheetInstance.insertRow([newId, '', 'feature', 'planned', '', '', '', '', 'medium', 5, 5, 5, '']);
  }

  deleteSelectedSpreadsheetRows() {
    if (!this.spreadsheetInstance) return;
    const selected = this.spreadsheetInstance.getSelectedRows();
    if (selected && selected.length > 0) {
      // Delete from bottom to top to maintain indices
      const sortedIndices = [...selected].sort((a, b) => b - a);
      sortedIndices.forEach((index) => {
        this.spreadsheetInstance.deleteRow(index);
      });
      this.showToast(`Deleted ${selected.length} row(s)`, 'success');
    } else {
      this.showToast('Select rows to delete first', 'info');
    }
  }

  saveSpreadsheetChanges() {
    if (!this.spreadsheetInstance) return;

    const data = this.spreadsheetInstance.getData();
    const updatedProjects = [];
    const errors = [];

    data.forEach((row, index) => {
      const [
        id, name, type, status, assigneeStr, startDate, endDate, 
        mandayEstimate, confidence, iceImpact, iceConfidence, iceEffort, description
      ] = row;

      // Skip empty rows
      if (!name || name.trim() === '') return;

      // Parse assignees back to IDs
      const assigneeNames = assigneeStr ? assigneeStr.split(',').map((s) => s.trim()).filter(Boolean) : [];
      const assignees = assigneeNames
        .map((name) => this.team.find((m) => m.name === name)?.id)
        .filter(Boolean);

      // Validate man-days
      const mandays = parseInt(mandayEstimate, 10);
      if (mandayEstimate && (isNaN(mandays) || mandays < 1)) {
        errors.push(`Row ${index + 1}: Invalid man-days estimate`);
      }

      // Build project object
      const existingProject = this.projects.find((p) => p.id === id);
      const projectData = {
        ...(existingProject || {}),
        id: id || Date.now() + index,
        name: name.trim(),
        type: type || 'feature',
        status: status || 'planned',
        assignees,
        startDate: startDate || '',
        endDate: endDate || '',
        mandayEstimate: mandays || existingProject?.mandayEstimate || 5,
        confidence: confidence || 'medium',
        iceImpact: parseInt(iceImpact, 10) || 5,
        iceConfidence: parseInt(iceConfidence, 10) || 5,
        iceEffort: parseInt(iceEffort, 10) || 5,
        description: description || '',
      };

      // Calculate ICE score
      projectData.iceScore = (projectData.iceImpact * projectData.iceConfidence) / projectData.iceEffort;

      updatedProjects.push(projectData);
    });

    if (errors.length > 0) {
      this.showToast(`Validation errors:\n${errors.join('\n')}`, 'error');
      return;
    }

    // Save changes
    this.pushUndoState('spreadsheet edit');
    this.projects = updatedProjects;
    Storage.saveProjects(this.projects);
    this.updateCapacityDisplay();
    this.refreshGantt();
    this.renderBacklog();
    this.closeSpreadsheetModal();
    this.showToast(`Saved ${updatedProjects.length} project(s)`, 'success');
  }

  getCompanyHolidayDatesInRange(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return this.companyHolidays
      .filter((h) => {
        const d = new Date(h.date + 'T00:00:00');
        return d >= start && d <= end;
      })
      .map((h) => h.date);
  }

  renameTeamMember(id, name) {
    const trimmed = name.trim();
    this.team = this.team.map((member) => (member.id === id
      ? {
          ...member,
          name: trimmed || member.name,
          avatar: this.getInitials(trimmed || member.name),
          color: this.generateMemberColor(trimmed || member.name),
        }
      : member));
    Storage.saveTeam(this.team);
    this.populateAssigneeSelect();
    this.refreshGantt();
  }

  updateTeamMemberRegion(id, regionId) {
    if (!this.regions.find((region) => region.id === regionId)) {
      this.showToast('Region not found', 'error');
      return;
    }
    this.team = this.team.map((member) => (member.id === id ? { ...member, regionId } : member));
    Storage.saveTeam(this.team);
    this.recalculateCapacity();
  }

  updateTeamMemberRole(id, roleId) {
    if (!this.roles.find((role) => role.id === roleId)) {
      this.showToast('Role not found', 'error');
      return;
    }
    this.team = this.team.map((member) => (member.id === id ? { ...member, roleId } : member));
    Storage.saveTeam(this.team);
    this.recalculateCapacity();
  }

  getInitials(name) {
    const parts = name.split(' ').filter(Boolean);
    if (!parts.length) return 'TM';
    return parts
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('');
  }

  generateMemberColor(name = '') {
    const seed = name.toLowerCase().trim() || 'teammate';
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = seed.charCodeAt(i) + ((hash << 5) - hash);
      hash |= 0; // keep 32-bit int
    }
    const hue = Math.abs(hash) % 360;
    const saturation = 65;
    const lightness = 55;
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }

  escapeHtml(value = '') {
    const replacements = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return value.replace(/[&<>"']/g, (char) => replacements[char] || char);
  }

  recalculateCapacity() {
    const engineersInput = document.getElementById('numEngineers');
    const engineersValue = engineersInput ? parseInt(engineersInput.value, 10) : null;
    
    // Get company holidays in the current quarter
    const quarterRange = GanttChart.getQuarterRange(this.settings.currentQuarter);
    const holidaysInQuarter = this.getCompanyHolidayDatesInRange(quarterRange.start, quarterRange.end);
    
    const config = {
      numEngineers: engineersValue || this.team.length || 1,
      ptoPerPerson: parseInt(document.getElementById('ptoPerPerson').value, 10) || 0,
      companyHolidays: holidaysInQuarter.length,
      companyHolidayDates: holidaysInQuarter,
      adhocReserve: parseInt(document.getElementById('adhocReserve').value, 10) || 0,
      bugReserve: parseInt(document.getElementById('bugReserve').value, 10) || 0,
      quarter: this.settings.currentQuarter,
      team: this.team,
      regions: this.regions,
      roles: this.roles,
    };

    const result = CapacityCalculator.calculate(config);

    document.getElementById('theoreticalCapacity').textContent = `${result.theoreticalCapacity} days`;
    document.getElementById('timeOffTotal').textContent = `-${result.timeOffTotal} days`;
    document.getElementById('reserveTotal').textContent = `-${result.reserveTotal} days`;
    document.getElementById('netCapacity').textContent = `${result.netCapacity} days`;

    this.renderMemberBreakdown(result.memberBreakdown);

    return { config, result };
  }

  applyCapacity() {
    const { config, result } = this.recalculateCapacity();
    this.capacity = {
      ...this.capacity,
      ...config,
      ...result,
    };
    Storage.saveCapacity(this.capacity);
    this.updateTeamSize(this.capacity.numEngineers);
    this.populateAssigneeSelect();
    this.updateCapacityDisplay();
    this.closeCapacityModal();
    this.showToast('Capacity settings applied successfully', 'success');
    this.refreshGantt();
  }

  updateTeamSize(newSize) {
    const currentSize = this.team.length;
    if (newSize > currentSize) {
      for (let i = currentSize; i < newSize; i += 1) {
        const id = this.team.length ? Math.max(...this.team.map((m) => m.id)) + 1 : 1;
        const memberName = `Team Member ${id}`;
        this.team.push({
          id,
          name: memberName,
          avatar: this.getInitials(memberName),
          regionId: this.regions[0]?.id ?? null,
          roleId: this.roles[0]?.id ?? null,
          color: this.generateMemberColor(memberName),
        });
      }
    } else if (newSize < currentSize) {
      const removedMembers = this.team.slice(newSize).map((member) => member.id);
      this.team = this.team.slice(0, newSize);
      if (removedMembers.length) {
        this.projects = this.projects.map((project) => {
          const assignees = Array.isArray(project.assignees) ? project.assignees : [];
          return {
            ...project,
            assignees: assignees.filter(
              (assigneeId) => !removedMembers.includes(assigneeId),
            ),
          };
        });
        Storage.saveProjects(this.projects);
      }
    }
    Storage.saveTeam(this.team);
  }

  updateCapacityDisplay() {
    const committed = this.calculateCommittedDays();
    const available = this.capacity.netCapacity || 0;
    const free = Math.max(0, available - committed);
    const utilization = CapacityCalculator.calculateUtilization(committed, available);

    const availableEl = document.getElementById('capacityAvailable');
    const committedEl = document.getElementById('capacityCommitted');
    const freeEl = document.getElementById('capacityFree');
    const percentEl = document.getElementById('capacityPercentage');
    if (availableEl) availableEl.textContent = available;
    if (committedEl) committedEl.textContent = committed;
    if (freeEl) freeEl.textContent = free;
    if (percentEl) percentEl.textContent = `${utilization}%`;

    const fillBar = document.getElementById('capacityBarFill');
    if (fillBar) {
      fillBar.style.width = `${Math.min(100, utilization)}%`;
      fillBar.className = 'capacity-bar-fill';
      if (utilization >= 100) {
        fillBar.classList.add('danger');
      } else if (utilization >= 90) {
        fillBar.classList.add('warning');
      }
    }
  }

  calculateCommittedDays() {
    return this.projects.reduce((total, project) => {
      if (!Array.isArray(project.assignees) || project.assignees.length === 0) {
        return total;
      }
      const start = new Date(project.startDate);
      const end = new Date(project.endDate);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return total;
      }
      const workingDays = this.countWorkingDays(start, end);
      return total + workingDays;
    }, 0);
  }

  openProjectModalWithDefaults(defaults = {}) {
    this.openProjectModal(null);
    
    // Pre-fill dates
    if (defaults.startDate) {
      document.getElementById('projectStartDate').value = defaults.startDate;
    }
    if (defaults.endDate) {
      document.getElementById('projectEndDate').value = defaults.endDate;
    }
    
    // Pre-select assignee
    if (defaults.assigneeId) {
      const assigneeSelect = document.getElementById('projectAssignee');
      if (assigneeSelect) {
        assigneeSelect.value = String(defaults.assigneeId);
      }
    }
    
    // Calculate estimated man-days based on date range
    if (defaults.startDate && defaults.endDate) {
      const start = new Date(defaults.startDate);
      const end = new Date(defaults.endDate);
      const workingDays = this.countWorkingDays(start, end);
      const manDayInput = document.getElementById('projectManDayEstimate');
      if (manDayInput && workingDays > 0) {
        manDayInput.value = workingDays;
      }
    }
    
    // Focus on project name
    setTimeout(() => {
      document.getElementById('projectName')?.focus();
    }, 100);
  }

  openProjectModal(project = null) {
    this.currentProject = project;
    const modal = document.getElementById('projectModal');
    modal?.classList.add('active');

    document.getElementById('projectModalTitle').textContent = project ? '✏️ Edit Project' : '+ Add Project';
    document.getElementById('projectName').value = project?.name || '';
    document.getElementById('projectStartDate').value = project?.startDate || '';
    document.getElementById('projectEndDate').value = project?.endDate || '';
    document.getElementById('projectStatus').value = project?.status || 'planned';
    document.getElementById('projectConfidence').value = project?.confidence || 'medium';
    document.getElementById('projectType').value = project?.type || 'feature';
    document.getElementById('projectDescription').value = project?.description || '';
    document.getElementById('projectNotes').value = project?.notes || '';
    const manDayInput = document.getElementById('projectManDayEstimate');
    if (manDayInput) {
      manDayInput.value = project?.mandayEstimate ?? '';
    }
    const iceImpactInput = document.getElementById('projectImpact');
    const iceConfidenceInput = document.getElementById('projectConfidenceScore');
    const iceEffortInput = document.getElementById('projectEffort');
    if (iceImpactInput) iceImpactInput.value = project?.iceImpact ?? 5;
    if (iceConfidenceInput) iceConfidenceInput.value = project?.iceConfidence ?? 5;
    if (iceEffortInput) iceEffortInput.value = project?.iceEffort ?? 5;
    this.updateIcePreview();

    const assignees = Array.isArray(project?.assignees) ? project.assignees : [];
    const assigneeSelect = document.getElementById('projectAssignee');
    if (assigneeSelect) {
      // Single assignee: select first assignee or empty
      assigneeSelect.value = assignees.length > 0 ? String(assignees[0]) : '';
    }

    document.getElementById('deleteProjectBtn').style.display = project ? 'inline-flex' : 'none';
  }

  clearAssigneesInModal() {
    const assigneeSelect = document.getElementById('projectAssignee');
    if (!assigneeSelect) return;
    assigneeSelect.value = '';
  }

  clearDatesInModal() {
    const startInput = document.getElementById('projectStartDate');
    const endInput = document.getElementById('projectEndDate');
    if (startInput) startInput.value = '';
    if (endInput) endInput.value = '';
  }

  closeProjectModal() {
    document.getElementById('projectModal')?.classList.remove('active');
    this.currentProject = null;
  }

  saveProject() {
    const name = document.getElementById('projectName').value.trim();
    const startDateInput = document.getElementById('projectStartDate').value;
    const endDateInput = document.getElementById('projectEndDate').value;

    if (!name) {
      this.showToast('Project name is required', 'error');
      return;
    }

    if (startDateInput && endDateInput && new Date(startDateInput) > new Date(endDateInput)) {
      this.showToast('End date must be after start date', 'error');
      return;
    }

    const assigneeSelect = document.getElementById('projectAssignee');
    if (!assigneeSelect) {
      this.showToast('Unable to load team members. Please refresh the page.', 'error');
      return;
    }

    const selectedValue = assigneeSelect.value;
    const assignees = selectedValue ? [parseInt(selectedValue, 10)] : [];
    const isUnassigned = assignees.length === 0;
    const impactInput = document.getElementById('projectImpact');
    const confidenceScoreInput = document.getElementById('projectConfidenceScore');
    const effortInput = document.getElementById('projectEffort');
    const manDayInput = document.getElementById('projectManDayEstimate');
    const iceImpact = this.normalizeIceValue(impactInput?.value ?? 5);
    const iceConfidence = this.normalizeIceValue(confidenceScoreInput?.value ?? 5);
    const iceEffort = this.normalizeIceValue(effortInput?.value ?? 5);
    const iceScore = this.calculateIceScore(iceImpact, iceConfidence, iceEffort);
    const storyPoints = this.estimateStoryPoints(iceEffort, iceConfidence, this.currentProject?.storyPoints);
    const mandayEstimate = this.normalizeManDayEstimate(manDayInput?.value);
    if (!mandayEstimate) {
      this.showToast('Man-day estimate is required', 'error');
      return;
    }

    // Push undo state before making changes
    this.pushUndoState(this.currentProject ? `edit ${name}` : `add ${name}`);

    const projectData = {
      name,
      startDate: startDateInput || '',
      endDate: endDateInput || '',
      status: document.getElementById('projectStatus').value,
      confidence: document.getElementById('projectConfidence').value,
      type: document.getElementById('projectType').value,
      description: document.getElementById('projectDescription').value,
      notes: document.getElementById('projectNotes')?.value || '',
      assignees,
      iceImpact,
      iceConfidence,
      iceEffort,
      iceScore,
      storyPoints,
      mandayEstimate,
    };

    const isScheduled = this.isProjectScheduled(projectData);

    if (this.currentProject) {
      const index = this.projects.findIndex((project) => project.id === this.currentProject.id);
      if (index !== -1) {
        this.projects[index] = { ...this.currentProject, ...projectData };
        this.showToast(
          !isScheduled
            ? 'Project saved to backlog dock'
            : isUnassigned
                ? 'Project updated – assign teammates when ready'
                : 'Project updated successfully',
          'success',
        );
      } else {
        this.showToast('Project could not be found', 'error');
        return;
      }
    } else {
      this.projects.push({ id: Date.now(), ...projectData });
      this.showToast(
        !isScheduled
          ? 'Project added to backlog dock'
          : isUnassigned
              ? 'Project added without owners'
              : 'Project added successfully',
        'success',
      );
    }

    Storage.saveProjects(this.projects);
    this.updateCapacityDisplay();
    this.refreshGantt();
    this.closeProjectModal();
  }

  updateProjectTimeline(projectId, newStart = null, newEnd = null, assigneeChange = null) {
    const index = this.projects.findIndex((project) => project.id === projectId);
    if (index === -1) return;
    const project = this.projects[index];
    const next = { ...project };
    let timelineChanged = false;
    let assignmentChanged = false;

    if (newStart) {
      const formatted = this.formatDateInput(newStart);
      if (formatted && formatted !== project.startDate) {
        next.startDate = formatted;
        timelineChanged = true;
      }
    }

    if (newEnd) {
      const formatted = this.formatDateInput(newEnd);
      if (formatted && formatted !== project.endDate) {
        next.endDate = formatted;
        timelineChanged = true;
      }
    }

    if (timelineChanged && next.startDate && next.endDate) {
      if (new Date(next.startDate) > new Date(next.endDate)) {
        return;
      }
    }

    if (
      assigneeChange
      && Number.isInteger(assigneeChange.from)
      && Number.isInteger(assigneeChange.to)
      && assigneeChange.from !== assigneeChange.to
    ) {
      // Single assignee: replace entirely
      next.assignees = [assigneeChange.to];
      assignmentChanged = true;
    }

    if (!timelineChanged && !assignmentChanged) return;

    // Push undo state before applying drag/resize changes
    this.pushUndoState(`move ${project.name}`);

    this.projects[index] = next;
    Storage.saveProjects(this.projects);
    this.updateCapacityDisplay();
    this.refreshGantt();

    let message = 'Project updated';
    if (timelineChanged && assignmentChanged) {
      message = 'Project timeline and owner updated';
    } else if (assignmentChanged) {
      const memberName = this.team.find((member) => member.id === assigneeChange.to)?.name;
      message = memberName ? `Reassigned to ${memberName}` : 'Project reassigned';
    } else if (timelineChanged) {
      message = 'Project timeline updated';
    }
    this.showToast(message, 'success');
  }

  formatDateInput(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      const year = value.getFullYear();
      const month = `${value.getMonth() + 1}`.padStart(2, '0');
      const day = `${value.getDate()}`.padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return value;
  }

  addDays(date, amount) {
    const base = date instanceof Date ? date : new Date(date);
    const copy = new Date(base);
    copy.setDate(copy.getDate() + amount);
    return copy;
  }

  isWeekend(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
    const day = date.getDay();
    return day === 0 || day === 6;
  }

  clampToWorkingDay(date) {
    const base = date instanceof Date ? new Date(date) : new Date(date);
    if (Number.isNaN(base.getTime())) return base;
    const copy = new Date(base);
    while (this.isWeekend(copy)) {
      copy.setDate(copy.getDate() + 1);
    }
    return copy;
  }

  addWorkingDays(start, workingDays) {
    const base = start instanceof Date ? new Date(start) : new Date(start);
    if (Number.isNaN(base.getTime())) return base;
    if (workingDays <= 1) {
      return this.clampToWorkingDay(base);
    }
    const result = this.clampToWorkingDay(base);
    let remaining = workingDays - 1;
    while (remaining > 0) {
      result.setDate(result.getDate() + 1);
      if (!this.isWeekend(result)) {
        remaining -= 1;
      }
    }
    return result;
  }

  getNextWorkingDay(date) {
    const base = date instanceof Date ? new Date(date) : new Date(date);
    if (Number.isNaN(base.getTime())) return base;
    base.setDate(base.getDate() + 1);
    return this.clampToWorkingDay(base);
  }

  countWorkingDays(start, end) {
    const startDate = this.clampToWorkingDay(start);
    const endDate = end instanceof Date ? new Date(end) : new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
    if (startDate > endDate) return 0;
    const cursor = new Date(startDate);
    let count = 0;
    while (cursor <= endDate) {
      if (!this.isWeekend(cursor)) {
        count += 1;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return Math.max(1, count);
  }

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
  }

  removeDragPreview() {
    if (this.dragPreviewElement?.parentNode) {
      this.dragPreviewElement.parentNode.removeChild(this.dragPreviewElement);
    }
    this.dragPreviewElement = null;
  }

  deleteProject() {
    if (!this.currentProject) return;
    if (!window.confirm('Are you sure you want to delete this project?')) return;
    this.pushUndoState(`delete ${this.currentProject.name}`);
    this.projects = this.projects.filter((project) => project.id !== this.currentProject.id);
    Storage.saveProjects(this.projects);
    this.updateCapacityDisplay();
    this.refreshGantt();
    this.closeProjectModal();
    this.showToast('Project deleted', 'success');
  }

  openExportModal() {
    document.getElementById('exportModal')?.classList.add('active');
  }

  closeExportModal() {
    document.getElementById('exportModal')?.classList.remove('active');
  }

  async exportPNG() {
    const buttonId = 'exportPNGBtn';
    this.toggleButtonLoading(buttonId, true);
    const canvas = await this.prepareExportCapture();
    if (!canvas) {
      this.finalizeExport(buttonId);
      return;
    }
    try {
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) resolve(result);
          else reject(new Error('Unable to render PNG blob'));
        }, 'image/png', 1);
      });
      const filename = this.buildExportFilename('png');
      this.downloadFile(blob, filename, 'image/png');
      this.showToast('PNG export ready! Check your downloads.', 'success');
    } catch (error) {
      console.error('PNG export failed', error);
      this.showToast('PNG export failed. Please try again.', 'error');
    } finally {
      this.finalizeExport(buttonId);
    }
  }

  async exportPDF() {
    const buttonId = 'exportPDFBtn';
    this.toggleButtonLoading(buttonId, true);
    const canvas = await this.prepareExportCapture();
    if (!canvas) {
      this.finalizeExport(buttonId);
      return;
    }
    try {
      const imageData = canvas.toDataURL('image/png');
      const orientation = canvas.width >= canvas.height ? 'landscape' : 'portrait';
      const pdf = new jsPDF({
        orientation,
        unit: 'px',
        format: [canvas.width, canvas.height],
        compress: true,
        hotfixes: ['px_scaling'],
      });
      pdf.addImage(imageData, 'PNG', 0, 0, canvas.width, canvas.height, undefined, 'FAST');
      pdf.save(this.buildExportFilename('pdf'));
      this.showToast('PDF export ready! Check your downloads.', 'success');
    } catch (error) {
      console.error('PDF export failed', error);
      this.showToast('PDF export failed. Please try again.', 'error');
    } finally {
      this.finalizeExport(buttonId);
    }
  }

  async prepareExportCapture() {
    const target = this.getExportTargetElement();
    if (!target) {
      this.showToast('Nothing to export—refresh and try again.', 'error');
      return null;
    }
    const modal = document.getElementById('exportModal');
    modal?.classList.remove('active');
    const previousScroll = window.pageYOffset;
    window.scrollTo(0, 0);
    
    // Store original styles and prepare for full capture
    const ganttTimeline = document.getElementById('ganttTimeline');
    const ganttContainer = document.getElementById('ganttContainer');
    const ganttTable = ganttTimeline?.querySelector('.gantt-table');
    const workspace = document.querySelector('.workspace');
    
    const originalStyles = {
      timeline: ganttTimeline ? {
        overflow: ganttTimeline.style.overflow,
        maxHeight: ganttTimeline.style.maxHeight,
        height: ganttTimeline.style.height,
        scrollLeft: ganttTimeline.scrollLeft,
        scrollTop: ganttTimeline.scrollTop,
      } : null,
      container: ganttContainer ? {
        overflow: ganttContainer.style.overflow,
        maxHeight: ganttContainer.style.maxHeight,
        height: ganttContainer.style.height,
      } : null,
      workspace: workspace ? {
        overflow: workspace.style.overflow,
        maxHeight: workspace.style.maxHeight,
        height: workspace.style.height,
        minHeight: workspace.style.minHeight,
      } : null,
    };
    
    // Expand containers to show full content
    if (ganttTimeline) {
      ganttTimeline.style.overflow = 'visible';
      ganttTimeline.style.maxHeight = 'none';
      ganttTimeline.style.height = 'auto';
      ganttTimeline.scrollLeft = 0;
      ganttTimeline.scrollTop = 0;
    }
    if (ganttContainer) {
      ganttContainer.style.overflow = 'visible';
      ganttContainer.style.maxHeight = 'none';
      ganttContainer.style.height = 'auto';
    }
    if (workspace) {
      workspace.style.overflow = 'visible';
      workspace.style.maxHeight = 'none';
      workspace.style.height = 'auto';
      workspace.style.minHeight = 'auto';
    }
    
    // Temporarily disable sticky positioning for proper html2canvas capture
    const stickyElements = document.querySelectorAll('.gantt-header-row, .gantt-header-cell.gantt-name-cell, .gantt-name-cell, .gantt-heatmap-label');
    const stickyOriginalStyles = [];
    stickyElements.forEach((el) => {
      stickyOriginalStyles.push({
        element: el,
        position: el.style.position,
        left: el.style.left,
        top: el.style.top,
        zIndex: el.style.zIndex,
      });
      el.style.position = 'relative';
      el.style.left = 'auto';
      el.style.top = 'auto';
    });
    
    // Create export wrapper with warnings and/or unallocated tasks
    let exportWrapper = null;
    const conflicts = this.detectConflicts();
    const backlogProjects = this.getBacklogProjects();
    const baseTarget = ganttTable || ganttContainer || target;
    const isDark = this.isCurrentThemeDark();
    
    if (conflicts.length > 0 || backlogProjects.length > 0) {
      // Create a wrapper div to hold the gantt, warnings, and backlog
      exportWrapper = document.createElement('div');
      exportWrapper.className = 'export-wrapper';
      exportWrapper.style.cssText = `
        display: flex;
        flex-direction: column;
        background: ${isDark ? '#16181d' : '#ffffff'};
        padding: 16px;
        gap: 16px;
      `;
      
      // Create warnings section if there are conflicts
      if (conflicts.length > 0) {
        const warningsSection = document.createElement('div');
        warningsSection.className = 'export-warnings';
        warningsSection.style.cssText = `
          background: ${isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)'};
          border: 1px solid ${isDark ? '#dc2626' : '#ef4444'};
          border-radius: 8px;
          padding: 12px 16px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;
        
        const warningsTitle = document.createElement('div');
        warningsTitle.style.cssText = `
          font-weight: 600;
          font-size: 14px;
          color: ${isDark ? '#fca5a5' : '#dc2626'};
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          gap: 6px;
        `;
        warningsTitle.innerHTML = `⚠️ ${conflicts.length} Warning${conflicts.length > 1 ? 's' : ''}`;
        warningsSection.appendChild(warningsTitle);
        
        const warningsList = document.createElement('ul');
        warningsList.style.cssText = `
          margin: 0;
          padding-left: 20px;
          font-size: 13px;
          color: ${isDark ? '#fecaca' : '#b91c1c'};
          line-height: 1.5;
        `;
        
        conflicts.forEach((conflict) => {
          const li = document.createElement('li');
          li.textContent = conflict.message;
          li.style.marginBottom = '4px';
          warningsList.appendChild(li);
        });
        warningsSection.appendChild(warningsList);
        exportWrapper.appendChild(warningsSection);
      }
      
      // Clone the gantt table for the export
      const ganttClone = baseTarget.cloneNode(true);
      ganttClone.style.width = `${baseTarget.scrollWidth}px`;
      exportWrapper.appendChild(ganttClone);
      
      // Create unallocated tasks section if there are backlog items
      if (backlogProjects.length > 0) {
        const backlogSection = document.createElement('div');
        backlogSection.className = 'export-backlog';
        backlogSection.style.cssText = `
          background: ${isDark ? 'rgba(251, 191, 36, 0.15)' : 'rgba(251, 191, 36, 0.1)'};
          border: 1px solid ${isDark ? '#d97706' : '#f59e0b'};
          border-radius: 8px;
          padding: 12px 16px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;
        
        const backlogTitle = document.createElement('div');
        backlogTitle.style.cssText = `
          font-weight: 600;
          font-size: 14px;
          color: ${isDark ? '#fcd34d' : '#b45309'};
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          gap: 6px;
        `;
        backlogTitle.innerHTML = `📋 ${backlogProjects.length} Unallocated Task${backlogProjects.length > 1 ? 's' : ''} (Backlog)`;
        backlogSection.appendChild(backlogTitle);
        
        const backlogList = document.createElement('div');
        backlogList.style.cssText = `
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          font-size: 13px;
          color: ${isDark ? '#fef3c7' : '#92400e'};
        `;
        
        backlogProjects.forEach((project) => {
          const item = document.createElement('div');
          const reasons = [];
          if (!this.hasAssignee(project)) reasons.push('No owner');
          if (!this.isProjectScheduled(project)) reasons.push('No dates');
          const mandayText = project.mandayEstimate ? ` • ${project.mandayEstimate}d` : '';
          item.style.cssText = `
            background: ${isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.7)'};
            padding: 6px 10px;
            border-radius: 4px;
            display: inline-flex;
            align-items: center;
            gap: 6px;
          `;
          item.innerHTML = `<strong>${this.escapeHtml(project.name)}</strong> <span style="opacity: 0.7">(${reasons.join(', ')}${mandayText})</span>`;
          backlogList.appendChild(item);
        });
        backlogSection.appendChild(backlogList);
        exportWrapper.appendChild(backlogSection);
      }
      
      document.body.appendChild(exportWrapper);
    }
    
    const exportTarget = exportWrapper || baseTarget;
    
    try {
      const canvas = await html2canvas(exportTarget, {
        backgroundColor: isDark ? '#16181d' : '#ffffff',
        scale: this.getExportScale(),
        useCORS: true,
        logging: false,
        removeContainer: true,
        windowWidth: exportTarget.scrollWidth,
        windowHeight: exportTarget.scrollHeight,
      });
      return canvas;
    } catch (error) {
      console.error('Export capture failed', error);
      this.showToast('Unable to capture the board. Try again.', 'error');
      return null;
    } finally {
      // Remove export wrapper if created
      if (exportWrapper && exportWrapper.parentNode) {
        exportWrapper.parentNode.removeChild(exportWrapper);
      }
      
      // Restore sticky positioning
      stickyOriginalStyles.forEach(({ element, position, left, top, zIndex }) => {
        element.style.position = position;
        element.style.left = left;
        element.style.top = top;
        element.style.zIndex = zIndex;
      });
      
      // Restore original styles
      if (ganttTimeline && originalStyles.timeline) {
        ganttTimeline.style.overflow = originalStyles.timeline.overflow;
        ganttTimeline.style.maxHeight = originalStyles.timeline.maxHeight;
        ganttTimeline.style.height = originalStyles.timeline.height;
        ganttTimeline.scrollLeft = originalStyles.timeline.scrollLeft;
        ganttTimeline.scrollTop = originalStyles.timeline.scrollTop;
      }
      if (ganttContainer && originalStyles.container) {
        ganttContainer.style.overflow = originalStyles.container.overflow;
        ganttContainer.style.maxHeight = originalStyles.container.maxHeight;
        ganttContainer.style.height = originalStyles.container.height;
      }
      if (workspace && originalStyles.workspace) {
        workspace.style.overflow = originalStyles.workspace.overflow;
        workspace.style.maxHeight = originalStyles.workspace.maxHeight;
        workspace.style.height = originalStyles.workspace.height;
        workspace.style.minHeight = originalStyles.workspace.minHeight;
      }
      window.scrollTo(0, previousScroll);
    }
  }

  finalizeExport(buttonId) {
    this.toggleButtonLoading(buttonId, false);
    this.closeExportModal();
  }

  toggleButtonLoading(buttonId, isLoading, loadingLabel = 'Rendering…') {
    const button = document.getElementById(buttonId);
    if (!button) return;
    if (isLoading) {
      button.dataset.originalText = button.dataset.originalText || button.textContent;
      button.disabled = true;
      button.textContent = loadingLabel;
    } else {
      button.disabled = false;
      if (button.dataset.originalText) {
        button.textContent = button.dataset.originalText;
        delete button.dataset.originalText;
      }
    }
  }

  getExportTargetElement() {
    return document.querySelector('.app-shell');
  }

  getExportScale() {
    const base = window.devicePixelRatio || 1;
    return Math.min(2, Math.max(1.5, base));
  }

  buildExportFilename(extension = 'png') {
    const now = new Date();
    const pad = (value) => value.toString().padStart(2, '0');
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(
      now.getHours(),
    )}-${pad(now.getMinutes())}`;
    return `quarterback-${stamp}.${extension}`;
  }

  exportCSV() {
    const headers = [
      'Project Name',
      'Allocation Status',
      'Assignees',
      'Start Date',
      'End Date',
      'Status',
      'Type',
      'Confidence',
      'ICE Impact',
      'ICE Confidence',
      'ICE Effort',
      'ICE Score',
      'Story Points',
      'Man Day Estimate',
    ];
    const rows = this.projects.map((project) => {
      const assigneeList = Array.isArray(project.assignees) ? project.assignees : [];
      const assigneeNames = assigneeList
        .map((id) => this.team.find((member) => member.id === id)?.name || '')
        .join('; ');
      const storyPoints = this.getProjectStoryPoints(project);
      const isAllocated = this.hasAssignee(project) && this.isProjectScheduled(project);
      const allocationStatus = isAllocated ? 'Allocated' : 'Unallocated (Backlog)';
      return [
        project.name,
        allocationStatus,
        assigneeNames,
        project.startDate,
        project.endDate,
        project.status,
        project.type,
        project.confidence,
        project.iceImpact ?? '',
        project.iceConfidence ?? '',
        project.iceEffort ?? '',
        project.iceScore ?? '',
        storyPoints,
        project.mandayEstimate ?? '',
      ];
    });
    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    this.downloadFile(csv, 'quarterback-projects.csv', 'text/csv');
    this.showToast('CSV exported successfully', 'success');
    this.closeExportModal();
  }

  exportJSON() {
    const data = Storage.exportData();
    const json = JSON.stringify(data, null, 2);
    this.downloadFile(json, 'quarterback-data.json', 'application/json');
    this.showToast('Data exported successfully', 'success');
    this.closeExportModal();
  }

  openImportModal() {
    document.getElementById('importModal')?.classList.add('active');
    const input = document.getElementById('importFileInput');
    if (input) input.value = '';
  }

  closeImportModal() {
    document.getElementById('importModal')?.classList.remove('active');
  }

  updateImportHint(format) {
    const hintEl = document.getElementById('importFormatHint');
    if (!hintEl) return;
    const hints = {
      quarterback: 'Upload a QuarterBack JSON export (full state) or project CSV (projects only).',
      jira: 'Upload a Jira CSV export. Maps Summary → Name, Story Points → Story Points, Due Date → End Date.',
      linear: 'Upload a Linear CSV export. Maps Title → Name, Estimate → Story Points, Due Date → End Date.'
    };
    hintEl.textContent = hints[format] || hints.quarterback;
  }

  handleImportSubmit() {
    const input = document.getElementById('importFileInput');
    if (!input || !input.files?.length) {
      this.showToast('Select a JSON or CSV file to import', 'error');
      return;
    }
    const file = input.files[0];
    const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type.includes('csv');
    const format = document.getElementById('importFormatSelect')?.value || 'quarterback';
    const reader = new FileReader();
    reader.onload = () => {
      try {
        if (isCsv) {
          const rows = this.parseCsv(reader.result);
          if (format === 'jira') {
            this.importProjectsFromJira(rows);
          } else if (format === 'linear') {
            this.importProjectsFromLinear(rows);
          } else {
            this.importProjectsFromCsv(rows);
          }
        } else {
          const payload = JSON.parse(reader.result);
          Storage.importData(payload);
          this.reloadFromStorage();
        }
        this.closeImportModal();
        this.showToast('Import completed successfully', 'success');
      } catch (error) {
        console.error('Import failed', error);
        this.showToast(isCsv ? 'Invalid CSV file' : 'Invalid JSON file', 'error');
      }
    };
    reader.onerror = () => {
      this.showToast('Unable to read file', 'error');
    };
    reader.readAsText(file);
  }

  importProjectsFromJira(rows) {
    if (!Array.isArray(rows) || !rows.length) {
      throw new Error('No rows found in Jira CSV');
    }
    const projects = rows.map((row, index) => {
      // Jira CSV typically has: Summary, Issue key, Issue Type, Status, Priority, Assignee, Story Points, Due Date, etc.
      const name = row['Summary'] || row['Issue key'] || `Jira Import ${index + 1}`;
      const storyPoints = parseFloat(row['Story Points'] || row['Custom field (Story Points)'] || '0') || 0;
      const dueDate = row['Due Date'] || row['Due date'] || '';
      const status = row['Status'] || 'backlog';
      const priority = row['Priority'] || '';
      const assignee = row['Assignee'] || '';
      
      // Calculate man-day estimate from story points (assume 1 SP = 0.5 days)
      const mandayEstimate = storyPoints > 0 ? Math.ceil(storyPoints * 0.5) : 5;
      
      // Parse due date and calculate start date (work backwards from due date)
      let endDate = this.parseImportDate(dueDate);
      let startDate = '';
      if (endDate) {
        const end = new Date(endDate);
        const start = new Date(end);
        start.setDate(start.getDate() - mandayEstimate);
        startDate = start.toISOString().split('T')[0];
      }
      
      // Map Jira status to our status
      const statusMap = {
        'To Do': 'backlog',
        'In Progress': 'in-progress',
        'Done': 'completed',
        'Closed': 'completed',
        'Open': 'backlog',
        'Backlog': 'backlog'
      };
      
      return {
        id: crypto.randomUUID(),
        name: name.substring(0, 100),
        startDate,
        endDate: endDate || '',
        status: statusMap[status] || 'backlog',
        type: 'feature',
        confidence: priority === 'Highest' || priority === 'High' ? 90 : 70,
        mandayEstimate,
        assignees: [],
        iceImpact: null,
        iceConfidence: null,
        iceEffort: null,
        iceScore: null,
        notes: `Imported from Jira: ${row['Issue key'] || ''}`
      };
    }).filter(p => p.name);
    
    this.projects = [...this.projects, ...projects];
    Storage.saveProjects(this.projects);
    this.reloadFromStorage();
  }

  importProjectsFromLinear(rows) {
    if (!Array.isArray(rows) || !rows.length) {
      throw new Error('No rows found in Linear CSV');
    }
    const projects = rows.map((row, index) => {
      // Linear CSV typically has: Title, Identifier, Status, Priority, Estimate, Assignee, Due Date, etc.
      const name = row['Title'] || row['Identifier'] || `Linear Import ${index + 1}`;
      const estimate = parseFloat(row['Estimate'] || '0') || 0;
      const dueDate = row['Due Date'] || row['Due date'] || '';
      const status = row['Status'] || 'backlog';
      const priority = row['Priority'] || '';
      
      // Calculate man-day estimate from estimate points
      const mandayEstimate = estimate > 0 ? Math.ceil(estimate * 0.5) : 5;
      
      // Parse due date and calculate start date
      let endDate = this.parseImportDate(dueDate);
      let startDate = '';
      if (endDate) {
        const end = new Date(endDate);
        const start = new Date(end);
        start.setDate(start.getDate() - mandayEstimate);
        startDate = start.toISOString().split('T')[0];
      }
      
      // Map Linear status to our status
      const statusMap = {
        'Backlog': 'backlog',
        'Todo': 'backlog',
        'In Progress': 'in-progress',
        'In Review': 'in-progress',
        'Done': 'completed',
        'Canceled': 'completed',
        'Cancelled': 'completed'
      };
      
      return {
        id: crypto.randomUUID(),
        name: name.substring(0, 100),
        startDate,
        endDate: endDate || '',
        status: statusMap[status] || 'backlog',
        type: 'feature',
        confidence: priority === 'Urgent' || priority === 'High' ? 90 : 70,
        mandayEstimate,
        assignees: [],
        iceImpact: null,
        iceConfidence: null,
        iceEffort: null,
        iceScore: null,
        notes: `Imported from Linear: ${row['Identifier'] || ''}`
      };
    }).filter(p => p.name);
    
    this.projects = [...this.projects, ...projects];
    Storage.saveProjects(this.projects);
    this.reloadFromStorage();
  }

  parseImportDate(dateStr) {
    if (!dateStr) return '';
    // Try various date formats
    const formats = [
      /^(\d{4})-(\d{2})-(\d{2})/, // YYYY-MM-DD
      /^(\d{2})\/(\d{2})\/(\d{4})/, // MM/DD/YYYY
      /^(\d{2})-(\d{2})-(\d{4})/, // DD-MM-YYYY
    ];
    for (const format of formats) {
      const match = dateStr.match(format);
      if (match) {
        if (format === formats[0]) {
          return dateStr.substring(0, 10);
        } else if (format === formats[1]) {
          return `${match[3]}-${match[1]}-${match[2]}`;
        } else if (format === formats[2]) {
          return `${match[3]}-${match[2]}-${match[1]}`;
        }
      }
    }
    // Try Date.parse as fallback
    const parsed = Date.parse(dateStr);
    if (!isNaN(parsed)) {
      return new Date(parsed).toISOString().split('T')[0];
    }
    return '';
  }

  reloadFromStorage() {
    this.loadData();
    this.ensureCapacityTotals();
    this.renderTeamMembersList();
    this.renderRegionSettings();
    this.renderRoleSettings();
    this.populateAssigneeSelect();
    this.updateCapacityDisplay();
    this.refreshGantt();
  }

  parseCsv(raw) {
    const lines = raw.split(/\r?\n/).filter((line) => line.trim().length);
    if (lines.length < 2) {
      throw new Error('CSV must include a header and at least one row');
    }
    const headers = lines[0].split(',').map((header) => header.trim());
    return lines.slice(1).map((line, index) => {
      const cells = this.splitCsvLine(line, headers.length);
      if (cells.length !== headers.length) {
        throw new Error(`Row ${index + 2} has ${cells.length} cells; expected ${headers.length}`);
      }
      const row = {};
      headers.forEach((header, idx) => {
        row[header] = cells[idx];
      });
      return row;
    });
  }

  splitCsvLine(line, expectedColumns) {
    const cells = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    if (expectedColumns && cells.length < expectedColumns) {
      while (cells.length < expectedColumns) cells.push('');
    }
    return cells;
  }

  importProjectsFromCsv(rows) {
    if (!Array.isArray(rows) || !rows.length) {
      throw new Error('No project rows found in CSV');
    }
    const normalizedProjects = rows
      .map((row, index) => this.transformCsvRowToProject(row, index + 2))
      .filter(Boolean);
    if (!normalizedProjects.length) {
      throw new Error('CSV did not contain any valid projects');
    }
    this.projects = [...this.projects, ...normalizedProjects];
    Storage.saveProjects(this.projects);
    this.reloadFromStorage();
  }

  transformCsvRowToProject(row, rowNumber) {
    const mandatoryFields = ['Project Name', 'Man Day Estimate'];
    for (const field of mandatoryFields) {
      if (!row[field] || !row[field].trim()) {
        console.warn(`Row ${rowNumber}: Missing ${field}`);
        return null;
      }
    }
    const name = row['Project Name'].trim();
    const mandayEstimate = this.normalizeManDayEstimate(row['Man Day Estimate']);
    if (!mandayEstimate) {
      console.warn(`Row ${rowNumber}: Invalid man-day estimate`);
      return null;
    }
    const safeText = (value, fallback = '') => (typeof value === 'string' ? value.trim() : fallback);
    const mapStatus = (value) => {
      const options = ['planned', 'in-progress', 'at-risk', 'blocked', 'completed'];
      const lower = safeText(value).toLowerCase();
      return options.includes(lower) ? lower : 'planned';
    };
    const mapType = (value) => {
      const options = ['feature', 'infrastructure', 'bug-fix', 'tech-debt', 'research', 'ops', 'operations', 'support', 'maintenance'];
      const lower = safeText(value).toLowerCase();
      return options.includes(lower) ? lower : 'feature';
    };
    const assigneeNames = safeText(row.Assignees);
    const assignees = this.mapAssigneesByName(assigneeNames);
    const startDate = safeText(row['Start Date']);
    const endDate = safeText(row['End Date']);
    const impact = this.normalizeIceValue(row['ICE Impact'] ?? 5);
    const confidence = this.normalizeIceValue(row['ICE Confidence'] ?? 5);
    const effort = this.normalizeIceValue(row['ICE Effort'] ?? 5);
    const storyPointsValue = this.parseOptionalNumber(row['Story Points']);
    const iceScoreValue = this.parseOptionalNumber(row['ICE Score']);
    const project = {
      id: Date.now() + Math.floor(Math.random() * 1000) + rowNumber,
      name,
      description: safeText(row.Description),
      status: mapStatus(row.Status),
      type: mapType(row.Type),
      confidence: safeText(row.Confidence || 'medium') || 'medium',
      startDate,
      endDate,
      assignees,
      iceImpact: impact,
      iceConfidence: confidence,
      iceEffort: effort,
      iceScore: typeof iceScoreValue === 'number' ? iceScoreValue : this.calculateIceScore(impact, confidence, effort),
      storyPoints: typeof storyPointsValue === 'number' && storyPointsValue > 0
        ? Math.round(storyPointsValue)
        : this.estimateStoryPoints(effort, confidence),
      mandayEstimate,
    };
    return project;
  }

  mapAssigneesByName(rawNames = '') {
    if (!rawNames) return [];
    const names = rawNames
      .split(';')
      .map((name) => name.trim())
      .filter(Boolean);
    if (!names.length) return [];
    const mapped = names
      .map((name) => this.team.find((member) => member.name.toLowerCase() === name.toLowerCase())?.id)
      .filter((id) => Number.isInteger(id));
    return Array.from(new Set(mapped));
  }

  downloadFile(content, filename, mimeType) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  shareView() {
    const url = window.location.href;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(url)
        .then(() => {
          this.showToast('Link copied to clipboard!', 'success');
        })
        .catch(() => {
          this.showToast('Unable to copy link', 'error');
        });
    } else {
      this.showToast('Clipboard not supported in this browser', 'error');
    }
  }

  changeView(viewType) {
    this.settings.viewType = viewType;
    Storage.saveSettings(this.settings);
    this.refreshGantt();
    this.showToast(`Switched to ${viewType} view`, 'success');
  }

  changeGrouping(groupBy) {
    this.settings.groupBy = groupBy;
    Storage.saveSettings(this.settings);
    this.showToast(`Grouped by ${groupBy}`, 'success');
  }

  changeQuarter(quarter) {
    this.settings.currentQuarter = quarter;
    Storage.saveSettings(this.settings);
    this.capacity = {
      ...this.capacity,
      ...CapacityCalculator.calculate({
        ...this.capacity,
        team: this.team,
        regions: this.regions,
        roles: this.roles,
        quarter: this.settings.currentQuarter,
      }),
    };
    Storage.saveCapacity(this.capacity);
    this.syncQuarterSelect();
    this.updateCapacityDisplay();
    this.refreshGantt();
    this.showToast(`Switched to ${quarter}`, 'success');
  }

  searchProjects(query) {
    this.searchTerm = query.trim().toLowerCase();
    this.refreshGantt();
  }

  clearAllFilters() {
    this.searchTerm = '';
    this.filterStatus = '';
    this.filterAssignee = '';
    this.filterType = '';
    const searchInput = document.getElementById('searchInput');
    const statusSelect = document.getElementById('filterStatus');
    const assigneeSelect = document.getElementById('filterAssignee');
    const typeSelect = document.getElementById('filterType');
    if (searchInput) searchInput.value = '';
    if (statusSelect) statusSelect.value = '';
    if (assigneeSelect) assigneeSelect.value = '';
    if (typeSelect) typeSelect.value = '';
    this.refreshGantt();
    this.showToast('Filters cleared', 'success');
  }

  populateFilterAssignees() {
    const select = document.getElementById('filterAssignee');
    if (!select) return;
    const currentValue = select.value;
    select.innerHTML = '<option value="">All Assignees</option>' +
      this.team.map((m) => `<option value="${m.id}">${this.escapeHtml(m.name)}</option>`).join('');
    select.value = currentValue;
  }

  getVisibleProjects() {
    let filtered = this.projects;
    
    // Text search
    if (this.searchTerm) {
      filtered = filtered.filter((project) => {
        const haystack = `${project.name} ${project.description || ''}`.toLowerCase();
        return haystack.includes(this.searchTerm);
      });
    }
    
    // Status filter
    if (this.filterStatus) {
      filtered = filtered.filter((project) => project.status === this.filterStatus);
    }
    
    // Assignee filter
    if (this.filterAssignee) {
      const assigneeId = parseInt(this.filterAssignee, 10);
      filtered = filtered.filter((project) => 
        Array.isArray(project.assignees) && project.assignees.includes(assigneeId)
      );
    }
    
    // Type filter
    if (this.filterType) {
      filtered = filtered.filter((project) => {
        const projectType = this.getProjectTheme(project);
        return projectType === this.filterType;
      });
    }
    
    return filtered;
  }

  refreshGantt() {
    GanttChart.update(this.getVisibleProjects(), this.team, {
      quarter: this.settings.currentQuarter,
      viewType: this.settings.viewType,
      roles: this.roles,
      regions: this.regions,
      companyHolidays: this.companyHolidays,
    });
    this.renderBacklog();
    this.renderConflictIndicators();
  }

  formatDateRangeLabel(startValue, endValue) {
    const start = this.formatDateLabel(startValue);
    const end = this.formatDateLabel(endValue);
    if (!start && !end) return 'Dates TBD';
    if (start && !end) return `${start} → TBD`;
    if (!start && end) return `TBD → ${end}`;
    return `${start} → ${end}`;
  }

  formatDateLabel(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => toast.classList.remove('show'), 3000);
  }

  // ─── Conflict Detection ──────────────────────────────────────────────────────
  detectConflicts() {
    const conflicts = [];
    const scheduledProjects = this.projects.filter((p) => this.isProjectScheduled(p) && this.hasAssignee(p));
    
    // Check for overlaps per engineer
    this.team.forEach((member) => {
      const memberProjects = scheduledProjects.filter((p) => 
        Array.isArray(p.assignees) && p.assignees.includes(member.id)
      );
      
      for (let i = 0; i < memberProjects.length; i++) {
        for (let j = i + 1; j < memberProjects.length; j++) {
          const a = memberProjects[i];
          const b = memberProjects[j];
          if (this.datesOverlap(a.startDate, a.endDate, b.startDate, b.endDate)) {
            conflicts.push({
              type: 'overlap',
              member: member.name,
              projects: [a.name, b.name],
              message: `${member.name} has overlapping tasks: "${a.name}" and "${b.name}"`,
            });
          }
        }
      }
    });
    
    // Check for capacity overruns per engineer
    const { start, end } = GanttChart.getQuarterRange(this.settings.currentQuarter);
    const quarterWorkingDays = this.countWorkingDays(new Date(start), new Date(end));
    const reservePercent = (this.capacity.adhocReserve || 0) + (this.capacity.bugReserve || 0);
    const availableDaysPerPerson = Math.floor(quarterWorkingDays * (1 - reservePercent / 100)) - (this.capacity.ptoPerPerson || 0);
    
    this.team.forEach((member) => {
      const memberProjects = scheduledProjects.filter((p) => 
        Array.isArray(p.assignees) && p.assignees.includes(member.id)
      );
      const totalDays = memberProjects.reduce((sum, p) => {
        return sum + this.countWorkingDays(new Date(p.startDate), new Date(p.endDate));
      }, 0);
      
      if (totalDays > availableDaysPerPerson) {
        conflicts.push({
          type: 'overload',
          member: member.name,
          allocated: totalDays,
          available: availableDaysPerPerson,
          message: `${member.name} is overloaded: ${totalDays} days scheduled vs ${availableDaysPerPerson} available`,
        });
      }
    });
    
    return conflicts;
  }

  datesOverlap(start1, end1, start2, end2) {
    const s1 = new Date(start1).getTime();
    const e1 = new Date(end1).getTime();
    const s2 = new Date(start2).getTime();
    const e2 = new Date(end2).getTime();
    return s1 <= e2 && s2 <= e1;
  }

  showConflictWarnings() {
    const conflicts = this.detectConflicts();
    if (!conflicts.length) return;
    
    const messages = conflicts.slice(0, 3).map((c) => c.message);
    const remaining = conflicts.length - 3;
    if (remaining > 0) {
      messages.push(`...and ${remaining} more conflict${remaining > 1 ? 's' : ''}`);
    }
    this.showToast(messages.join('\n'), 'error');
  }

  renderConflictIndicators() {
    const conflicts = this.detectConflicts();
    const conflictIndicator = document.getElementById('conflictIndicator');
    
    if (conflictIndicator) {
      if (conflicts.length > 0) {
        conflictIndicator.textContent = `⚠️ ${conflicts.length} conflict${conflicts.length > 1 ? 's' : ''}`;
        conflictIndicator.style.display = 'inline-flex';
        conflictIndicator.title = conflicts.map((c) => c.message).join('\n');
      } else {
        conflictIndicator.style.display = 'none';
      }
    }
    
    // Add visual indicators to overloaded gantt rows
    document.querySelectorAll('.gantt-row').forEach((row) => {
      row.classList.remove('has-conflict');
    });
    
    conflicts.forEach((conflict) => {
      if (conflict.type === 'overlap' || conflict.type === 'overload') {
        const member = this.team.find((m) => m.name === conflict.member);
        if (member) {
          const row = document.querySelector(`.gantt-row[data-person-id="${member.id}"]`);
          row?.classList.add('has-conflict');
        }
      }
    });
  }

  // ─── Undo/Redo System ───────────────────────────────────────────────────────
  pushUndoState(actionLabel = 'change') {
    const snapshot = JSON.stringify(this.projects);
    this.undoStack.push({ snapshot, label: actionLabel });
    if (this.undoStack.length > this.maxHistorySize) {
      this.undoStack.shift();
    }
    this.redoStack = []; // clear redo on new action
  }

  undo() {
    if (!this.undoStack.length) {
      this.showToast('Nothing to undo', 'error');
      return;
    }
    const currentSnapshot = JSON.stringify(this.projects);
    const prev = this.undoStack.pop();
    this.redoStack.push({ snapshot: currentSnapshot, label: prev.label });
    this.projects = JSON.parse(prev.snapshot);
    Storage.saveProjects(this.projects);
    this.updateCapacityDisplay();
    this.refreshGantt();
    this.showToast(`Undo: ${prev.label}`, 'success');
  }

  redo() {
    if (!this.redoStack.length) {
      this.showToast('Nothing to redo', 'error');
      return;
    }
    const currentSnapshot = JSON.stringify(this.projects);
    const next = this.redoStack.pop();
    this.undoStack.push({ snapshot: currentSnapshot, label: next.label });
    this.projects = JSON.parse(next.snapshot);
    Storage.saveProjects(this.projects);
    this.updateCapacityDisplay();
    this.refreshGantt();
    this.showToast(`Redo: ${next.label}`, 'success');
  }

  // ─── Keyboard Navigation ────────────────────────────────────────────────────
  selectProject(projectId) {
    this.selectedProjectId = projectId;
    document.querySelectorAll('.project-bar').forEach((bar) => {
      bar.classList.toggle('selected', parseInt(bar.dataset.projectId, 10) === projectId);
    });
  }

  clearSelection() {
    this.selectedProjectId = null;
    document.querySelectorAll('.project-bar.selected').forEach((bar) => {
      bar.classList.remove('selected');
    });
  }

  deleteSelectedProject() {
    if (!this.selectedProjectId) return;
    const project = this.projects.find((p) => p.id === this.selectedProjectId);
    if (!project) return;
    this.pushUndoState(`delete ${project.name}`);
    this.projects = this.projects.filter((p) => p.id !== this.selectedProjectId);
    Storage.saveProjects(this.projects);
    this.clearSelection();
    this.updateCapacityDisplay();
    this.refreshGantt();
    this.showToast(`Deleted "${project.name}"`, 'success');
  }

  moveSelectedProject(direction) {
    if (!this.selectedProjectId) return;
    const project = this.projects.find((p) => p.id === this.selectedProjectId);
    if (!project || !project.startDate || !project.endDate) return;
    
    const daysToMove = direction === 'left' ? -1 : 1;
    const start = new Date(project.startDate);
    const end = new Date(project.endDate);
    start.setDate(start.getDate() + daysToMove);
    end.setDate(end.getDate() + daysToMove);
    
    this.pushUndoState(`move ${project.name}`);
    const index = this.projects.findIndex((p) => p.id === this.selectedProjectId);
    this.projects[index] = {
      ...project,
      startDate: this.formatDateInput(start),
      endDate: this.formatDateInput(end),
    };
    Storage.saveProjects(this.projects);
    this.updateCapacityDisplay();
    this.refreshGantt();
    // Re-select after refresh
    requestAnimationFrame(() => this.selectProject(this.selectedProjectId));
  }

  handleKeyboardShortcut(event) {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modKey = isMac ? event.metaKey : event.ctrlKey;
    
    // Ignore if in input/textarea
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    
    // Undo: Cmd/Ctrl+Z
    if (modKey && !event.shiftKey && event.key === 'z') {
      event.preventDefault();
      this.undo();
      return;
    }
    
    // Redo: Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y
    if ((modKey && event.shiftKey && event.key === 'z') || (modKey && event.key === 'y')) {
      event.preventDefault();
      this.redo();
      return;
    }
    
    // Delete selected project
    if ((event.key === 'Delete' || event.key === 'Backspace') && this.selectedProjectId) {
      event.preventDefault();
      this.deleteSelectedProject();
      return;
    }
    
    // Arrow keys to move selected project
    if (event.key === 'ArrowLeft' && this.selectedProjectId) {
      event.preventDefault();
      this.moveSelectedProject('left');
      return;
    }
    if (event.key === 'ArrowRight' && this.selectedProjectId) {
      event.preventDefault();
      this.moveSelectedProject('right');
      return;
    }
    
    // Enter to edit selected project
    if (event.key === 'Enter' && this.selectedProjectId) {
      event.preventDefault();
      const project = this.projects.find((p) => p.id === this.selectedProjectId);
      if (project) this.openProjectModal(project);
      return;
    }
    
    // Escape to clear selection
    if (event.key === 'Escape') {
      this.clearSelection();
      this.closeProjectModal();
    }
  }
}

export const App = new QuarterBackApp();
