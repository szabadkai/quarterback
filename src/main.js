import './style.css'
import { App } from './app.js'

const mount = document.querySelector('#app')

if (!mount) {
  throw new Error('Root element #app not found')
}

mount.innerHTML = getAppTemplate()

window.App = App
App.init()

function getAppTemplate() {
  return `
    <a href="#main-content" class="skip-link">Skip to main content</a>
    <div class="app-shell" role="application" aria-label="QuarterBack Planning Tool">
      <header class="header" role="banner">
        <div class="header-content">
          <h1>📊 QuarterBack</h1>
          <nav class="header-controls" aria-label="Main navigation">
            <select id="quarterSelect" class="quarter-select" aria-label="Select quarter">
              <option value="Q1-2024">Q1 2024</option>
              <option value="Q2-2024">Q2 2024</option>
              <option value="Q3-2024">Q3 2024</option>
              <option value="Q4-2024">Q4 2024</option>
              <option value="Q1-2025">Q1 2025</option>
              <option value="Q2-2025">Q2 2025</option>
            </select>
            <button id="capacityBtn" class="btn btn-secondary" aria-label="Open capacity planning tool">⚙️ Capacity Tool</button>
            <button id="exportBtn" class="btn btn-secondary" aria-label="Export data">📥 Export</button>
            <button id="importBtn" class="btn btn-secondary" aria-label="Import data">📤 Import</button>
            <button id="shareBtn" class="btn btn-secondary" aria-label="Share project">🔗 Share</button>
            <select id="themeSelect" class="theme-select" aria-label="Select color theme">
              <option value="light">☀️ Light (Default)</option>
              <option value="github-light">☀️ GitHub Light</option>
              <option value="solarized-light">☀️ Solarized Light</option>
              <option value="quiet-light">☀️ Quiet Light</option>
              <option value="monokai">🌙 Monokai</option>
              <option value="one-dark-pro">🌙 One Dark Pro</option>
              <option value="dracula">🌙 Dracula</option>
              <option value="github-dark">🌙 GitHub Dark</option>
              <option value="nord">🌙 Nord</option>
              <option value="solarized-dark">🌙 Solarized Dark</option>
              <option value="night-owl">🌙 Night Owl</option>
            </select>
          </div>
        </div>
      </header>

      <div class="toolbar">
        <div class="toolbar-left">
          <button id="addProjectBtn" class="btn btn-primary">+ Add Project</button>
          <button id="spreadsheetBtn" class="btn btn-secondary" title="Edit all projects in spreadsheet view">📋 Table View</button>
          <div class="view-controls">
            <label for="viewTypeSelect">View:</label>
            <select id="viewTypeSelect" aria-label="Select view type">
              <option value="quarter">Quarter (13 weeks)</option>
              <option value="month">Single Month</option>
              <option value="6weeks">6 Weeks</option>
              <option value="2weeks">2 Weeks (detailed)</option>
            </select>
            <select id="groupBySelect" aria-label="Group timeline by">
              <option value="person">By Person</option>
              <option value="project">By Project</option>
              <option value="status">By Status</option>
            </select>
          </div>
        </div>
        <div class="toolbar-right">
          <div class="filter-controls">
            <input type="text" id="searchInput" placeholder="Search projects..." class="search-input" aria-label="Search projects" />
            <select id="filterStatus" class="filter-select" aria-label="Filter by status">
              <option value="">All Statuses</option>
              <option value="planned">Planned</option>
              <option value="in-progress">In Progress</option>
              <option value="at-risk">At Risk</option>
              <option value="blocked">Blocked</option>
              <option value="completed">Completed</option>
            </select>
            <select id="filterAssignee" class="filter-select" aria-label="Filter by assignee">
              <option value="">All Assignees</option>
            </select>
            <select id="filterType" class="filter-select" aria-label="Filter by type">
              <option value="">All Types</option>
              <option value="feature">✨ Feature</option>
              <option value="bug-fix">🐛 Bug Fix</option>
              <option value="tech-debt">🔧 Tech Debt</option>
              <option value="infrastructure">🏗️ Infrastructure</option>
              <option value="research">🔬 Research</option>
              <option value="security">🔒 Security</option>
              <option value="performance">⚡ Performance</option>
              <option value="documentation">📝 Documentation</option>
              <option value="testing">🧪 Testing</option>
              <option value="design">🎨 Design</option>
              <option value="support">🎧 Support</option>
              <option value="ops">⚙️ Operations</option>
              <option value="maintenance">🛠️ Maintenance</option>
              <option value="integration">🔗 Integration</option>
              <option value="migration">📦 Migration</option>
            </select>
            <button id="clearFiltersBtn" class="btn btn-small btn-secondary" aria-label="Clear filters">Clear</button>
          </div>
        </div>
      </div>

      <div class="capacity-summary" id="capacitySummary">
        <div class="capacity-text">
          <span id="capacityAvailable">0</span> days available |
          <span id="capacityCommitted">0</span> committed |
          <span id="capacityFree">0</span> free |
          <span id="capacityBacklog">0</span> in backlog
          <span class="conflict-indicator" id="conflictIndicator" style="display: none;" title="Click for details"></span>
        </div>
        <div class="capacity-bar">
          <div class="capacity-bar-fill" id="capacityBarFill" style="width: 0%">
            <span id="capacityPercentage">0%</span>
          </div>
        </div>
      </div>

      <section class="backlog-dock collapsed" id="backlogDock">
        <div class="backlog-header">
          <div>
            <h2>Backlog</h2>
            <p class="todo-hint">Drag cards onto the calendar to auto-fill ownership and dates.</p>
          </div>
          <div class="backlog-actions">
            <span class="todo-count" id="backlogCount">0</span>
            <button class="btn btn-secondary btn-small" id="autoAllocateBtn" type="button">Auto allocate</button>
            <button class="btn btn-secondary btn-small" id="resetBoardBtn" type="button">Reset board</button>
            <button class="btn btn-secondary btn-small" id="toggleBacklogBtn" type="button">Expand</button>
          </div>
        </div>
        <div class="backlog-list" id="backlogList"></div>
      </section>

      <main id="main-content" class="workspace" role="main">
        <div class="gantt-container" id="ganttContainer" aria-label="Project timeline gantt chart">
          <div class="gantt-timeline" id="ganttTimeline" role="region" aria-label="Timeline with project bars"></div>
          <div class="gantt-tooltip" id="timelineTooltip" role="status" aria-live="polite"></div>
        </div>
      </main>

      <div class="empty-state" id="emptyState">
        <div class="empty-state-content">
          <h2>👋 Welcome to QuarterBack!</h2>
          <p>Start by setting up your team capacity, then add your first project.</p>
          <button class="btn btn-primary btn-large" id="setupCapacityBtn">⚙️ Set Up Team Capacity</button>
          <button class="btn btn-secondary btn-large" id="addFirstProjectBtn">+ Add First Project</button>
        </div>
      </div>

      <div class="modal" id="capacityModal" aria-hidden="true" role="dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h2>⚙️ Capacity Estimator</h2>
            <button class="modal-close" id="closeCapacityModal" aria-label="Close capacity modal">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-section">
              <h3>Team Composition</h3>
              <div class="form-group">
                <label for="numEngineers">Number of Engineers:</label>
                <input type="number" id="numEngineers" value="5" min="1" max="50" />
              </div>
              <p class="form-hint">Assign each teammate to a regional PTO calendar and occupational rule.</p>
              <div class="team-members-header">
                <span>Name</span>
                <span>Region</span>
                <span>Role</span>
              </div>
              <div id="teamMembersList" class="team-members-list"></div>
              <button class="btn btn-small" id="addTeamMemberBtn" type="button">+ Add Team Member</button>
            </div>
            <div class="form-section">
              <h3>Time Off & Holidays</h3>
              <div class="form-group">
                <label for="ptoPerPerson">Average PTO days per person:</label>
                <input type="number" id="ptoPerPerson" value="8" min="0" max="30" />
              </div>
              <div class="form-group">
                <label>Company holidays:</label>
                <div class="holiday-summary-row">
                  <span id="companyHolidaysCount">0 days configured</span>
                  <button class="btn btn-small btn-secondary" id="manageHolidaysBtn" type="button">🗓️ Manage Holidays</button>
                </div>
              </div>
            </div>

            <div class="form-section">
              <div class="config-section-header">
                <h3>Regional PTO Calendars</h3>
                <span class="config-columns">Name · PTO Days · Holidays</span>
              </div>
              <div id="regionSettingsList" class="config-list"></div>
              <button class="btn btn-small" id="addRegionBtn" type="button">+ Add Region</button>
            </div>

            <div class="form-section">
              <div class="config-section-header">
                <h3>Occupational Focus Rules</h3>
                <span class="config-columns">Name · Focus %</span>
              </div>
              <div id="roleSettingsList" class="config-list"></div>
              <button class="btn btn-small" id="addRoleBtn" type="button">+ Add Role Rule</button>
            </div>

            <div class="form-section">
              <h3>Reserve Buffers</h3>
              <div class="form-group">
                <label for="adhocReserve">Ad-hoc work reserve:</label>
                <select id="adhocReserve">
                  <option value="10">10% - Stable team</option>
                  <option value="20" selected>20% - Recommended</option>
                  <option value="30">30% - New team</option>
                  <option value="40">40% - High support</option>
                </select>
              </div>
              <div class="form-group">
                <label for="bugReserve">Bug fixes reserve:</label>
                <select id="bugReserve">
                  <option value="5">5% - New product</option>
                  <option value="10" selected>10% - Typical</option>
                  <option value="15">15% - Legacy system</option>
                </select>
              </div>
            </div>

            <div class="capacity-result">
              <h3>Capacity Summary</h3>
              <div class="capacity-breakdown">
                <div class="breakdown-row">
                  <span>Theoretical capacity:</span>
                  <span id="theoreticalCapacity">0 days</span>
                </div>
                <div class="breakdown-row negative">
                  <span>- Time off (PTO + Holidays):</span>
                  <span id="timeOffTotal">-0 days</span>
                </div>
                <div class="breakdown-row negative">
                  <span>- Reserves (Ad-hoc + Bugs):</span>
                  <span id="reserveTotal">-0 days</span>
                </div>
                <div class="breakdown-row total">
                  <span><strong>Net Available Capacity:</strong></span>
                  <span id="netCapacity"><strong>0 days</strong></span>
                </div>
              </div>
              <div class="member-breakdown" id="memberBreakdownList">
                <p class="member-breakdown-empty">Add regions & roles to see per-person rollups.</p>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="cancelCapacityBtn">Cancel</button>
            <button class="btn btn-primary" id="applyCapacityBtn">Apply to Gantt</button>
          </div>
        </div>
      </div>

      <div class="modal" id="projectModal" aria-hidden="true" role="dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h2 id="projectModalTitle">+ Add Project</h2>
            <button class="modal-close" id="closeProjectModal" aria-label="Close project modal">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label for="projectName">Project Name: *</label>
              <input type="text" id="projectName" placeholder="e.g., User Authentication Redesign" required />
            </div>
            <div class="form-group">
              <div class="form-label-row">
                <label for="projectAssignee">Assignee:</label>
                <button type="button" class="link-btn" id="clearAssigneesBtn">Clear owner</button>
              </div>
              <select id="projectAssignee" aria-label="Assign team member">
                <option value="">— Select assignee —</option>
              </select>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="projectStartDate">Start Date (optional)</label>
                <input type="date" id="projectStartDate" />
              </div>
              <div class="form-group">
                <div class="form-label-row">
                  <label for="projectEndDate">End Date (optional)</label>
                  <button type="button" class="link-btn" id="clearDatesBtn">Clear dates</button>
                </div>
                <input type="date" id="projectEndDate" />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="projectStatus">Status:</label>
                <select id="projectStatus">
                  <option value="planned">Planned</option>
                  <option value="in-progress">In Progress</option>
                  <option value="at-risk">At Risk</option>
                  <option value="blocked">Blocked</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div class="form-group">
                <label for="projectConfidence">Confidence:</label>
                <select id="projectConfidence">
                  <option value="high">High</option>
                  <option value="medium" selected>Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label for="projectType">Project Type:</label>
              <select id="projectType">
                <option value="feature">✨ Feature</option>
                <option value="bug-fix">🐛 Bug Fix</option>
                <option value="tech-debt">🔧 Tech Debt</option>
                <option value="infrastructure">🏗️ Infrastructure</option>
                <option value="research">🔬 Research</option>
                <option value="security">🔒 Security</option>
                <option value="performance">⚡ Performance</option>
                <option value="documentation">📝 Documentation</option>
                <option value="testing">🧪 Testing</option>
                <option value="design">🎨 Design</option>
                <option value="support">🎧 Support</option>
                <option value="ops">⚙️ Operations</option>
                <option value="maintenance">🛠️ Maintenance</option>
                <option value="integration">🔗 Integration</option>
                <option value="migration">📦 Migration</option>
              </select>
            </div>
            <div class="form-group">
              <label for="projectDescription">Description:</label>
              <textarea id="projectDescription" rows="3" maxlength="500" placeholder="Optional description..."></textarea>
            </div>
            <div class="form-group">
              <label for="projectNotes">Notes / Comments:</label>
              <textarea id="projectNotes" rows="3" maxlength="1000" placeholder="Internal notes, blockers, updates..."></textarea>
            </div>
            <div class="form-group">
              <label for="projectManDayEstimate">Estimate (man-days): *</label>
              <input type="number" id="projectManDayEstimate" min="1" required placeholder="e.g., 20" />
              <p class="form-hint">Used for planning, auto allocation, and exports.</p>
            </div>
            <div class="form-section">
              <h3>ICE Score Helper</h3>
              <div class="form-row">
                <div class="form-group">
                  <label for="projectImpact">Impact (1-10):</label>
                  <input type="number" id="projectImpact" min="1" max="10" value="5" />
                </div>
                <div class="form-group">
                  <label for="projectConfidenceScore">Confidence (1-10):</label>
                  <input type="number" id="projectConfidenceScore" min="1" max="10" value="5" />
                </div>
                <div class="form-group">
                  <label for="projectEffort">Effort (1-10):</label>
                  <input type="number" id="projectEffort" min="1" max="10" value="5" />
                </div>
              </div>
              <p class="form-hint">ICE Score: <span id="projectIceScore">25</span></p>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="cancelProjectBtn">Cancel</button>
            <button class="btn btn-secondary" id="sendToBacklogBtn" type="button">Send to Backlog</button>
            <button class="btn btn-danger" id="deleteProjectBtn" style="display:none;">Delete</button>
            <button class="btn btn-primary" id="saveProjectBtn">Save Project</button>
          </div>
        </div>
      </div>

      <div class="modal" id="exportModal" aria-hidden="true" role="dialog">
        <div class="modal-content modal-small">
          <div class="modal-header">
            <h2>📥 Export</h2>
            <button class="modal-close" id="closeExportModal" aria-label="Close export modal">&times;</button>
          </div>
          <div class="modal-body">
            <button class="btn btn-secondary btn-block" id="exportPNGBtn">📸 Export as PNG</button>
            <button class="btn btn-secondary btn-block" id="exportPDFBtn">🖨️ Export as PDF</button>
            <button class="btn btn-secondary btn-block" id="exportCSVBtn">📊 Export as CSV</button>
            <button class="btn btn-secondary btn-block" id="exportJSONBtn">💾 Export Data (JSON)</button>
            <a class="btn btn-secondary btn-block" href="/sample-projects.csv" download>
              📄 Download Sample CSV
            </a>
          </div>
        </div>
      </div>

      <div class="modal" id="importModal" aria-hidden="true" role="dialog">
        <div class="modal-content modal-small">
          <div class="modal-header">
            <h2>📤 Import Data</h2>
            <button class="modal-close" id="closeImportModal" aria-label="Close import modal">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label for="importFormatSelect">Import Format</label>
              <select id="importFormatSelect" class="form-control">
                <option value="quarterback">QuarterBack (JSON/CSV)</option>
                <option value="jira">Jira CSV Export</option>
                <option value="linear">Linear CSV Export</option>
              </select>
            </div>
            <p class="form-hint" id="importFormatHint">Upload a QuarterBack JSON export (full state) or project CSV (projects only).</p>
            <input type="file" id="importFileInput" accept="application/json,text/csv" />
            <div class="form-hint">Need to see the CSV column layout? Download the sample below.</div>
            <a class="btn btn-secondary btn-block" href="/sample-projects.csv" download>
              📄 Download Sample CSV
            </a>
            <p class="form-hint"><strong>Tip:</strong> CSV import only touches projects; JSON restores everything.</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="cancelImportBtn" type="button">Cancel</button>
            <button class="btn btn-primary" id="runImportBtn" type="button">Import Data</button>
          </div>
        </div>
      </div>

      <div class="modal" id="ptoModal" aria-hidden="true" role="dialog">
        <div class="modal-content modal-small">
          <div class="modal-header">
            <h2 id="ptoModalTitle">📅 Manage PTO</h2>
            <button class="modal-close" id="closePtoModal" aria-label="Close PTO modal">&times;</button>
          </div>
          <div class="modal-body">
            <p class="form-hint">Add dates when this team member will be unavailable (vacation, sick leave, etc.)</p>
            <div class="form-group">
              <label for="ptoDateInput">Add PTO Date:</label>
              <div class="pto-date-input-row">
                <input type="date" id="ptoDateInput" />
                <button class="btn btn-small btn-primary" id="addPtoDateBtn" type="button">Add</button>
              </div>
            </div>
            <div class="form-group">
              <label>Scheduled PTO Dates:</label>
              <div id="ptoDatesListContainer" class="pto-dates-list"></div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary" id="savePtoBtn" type="button">Done</button>
          </div>
        </div>
      </div>

      <div class="modal" id="holidaysModal" aria-hidden="true" role="dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h2>🗓️ Company Holidays</h2>
            <button class="modal-close" id="closeHolidaysModal" aria-label="Close holidays modal">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>Import Public Holidays:</label>
              <div class="holiday-import-row">
                <select id="countryCodeSelect">
                  <option value="AU">🇦🇺 Australia</option>
                  <option value="AT">🇦🇹 Austria</option>
                  <option value="BE">🇧🇪 Belgium</option>
                  <option value="BR">🇧🇷 Brazil</option>
                  <option value="CA">🇨🇦 Canada</option>
                  <option value="CZ">🇨🇿 Czech Republic</option>
                  <option value="DK">🇩🇰 Denmark</option>
                  <option value="FI">🇫🇮 Finland</option>
                  <option value="FR">🇫🇷 France</option>
                  <option value="DE">🇩🇪 Germany</option>
                  <option value="HK">🇭🇰 Hong Kong</option>
                  <option value="HU">🇭🇺 Hungary</option>
                  <option value="IN">🇮🇳 India</option>
                  <option value="IE">🇮🇪 Ireland</option>
                  <option value="IL">🇮🇱 Israel</option>
                  <option value="IT">🇮🇹 Italy</option>
                  <option value="JP">🇯🇵 Japan</option>
                  <option value="MX">🇲🇽 Mexico</option>
                  <option value="NL">🇳🇱 Netherlands</option>
                  <option value="NZ">🇳🇿 New Zealand</option>
                  <option value="NO">🇳🇴 Norway</option>
                  <option value="PL">🇵🇱 Poland</option>
                  <option value="PT">🇵🇹 Portugal</option>
                  <option value="SG">🇸🇬 Singapore</option>
                  <option value="ZA">🇿🇦 South Africa</option>
                  <option value="KR">🇰🇷 South Korea</option>
                  <option value="ES">🇪🇸 Spain</option>
                  <option value="SE">🇸🇪 Sweden</option>
                  <option value="CH">🇨🇭 Switzerland</option>
                  <option value="GB">🇬🇧 United Kingdom</option>
                  <option value="US" selected>🇺🇸 United States</option>
                </select>
                <input type="number" id="holidayYearInput" min="2020" max="2030" placeholder="Year" />
                <button class="btn btn-small btn-secondary" id="fetchHolidaysBtn" type="button">🌐 Fetch</button>
              </div>
              <p class="form-hint">Fetch public holidays from <a href="https://date.nager.at" target="_blank" rel="noopener">Nager.Date API</a> (free, no API key needed)</p>
            </div>
            <hr class="form-divider" />
            <p class="form-hint">Define company-wide holidays that apply to all team members. These dates will be excluded from capacity calculations.</p>
            <div class="form-group">
              <label>Add Holiday Manually:</label>
              <div class="holiday-input-row">
                <input type="date" id="holidayDateInput" />
                <input type="text" id="holidayNameInput" placeholder="Holiday name (e.g., Christmas)" maxlength="50" />
                <button class="btn btn-small btn-primary" id="addHolidayBtn" type="button">Add</button>
              </div>
            </div>
            <div class="form-group">
              <label>Company Holidays (<span id="holidayCount">0</span>):</label>
              <div id="holidaysListContainer" class="holidays-list"></div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary" id="saveHolidaysBtn" type="button">Done</button>
          </div>
        </div>
      </div>

      <div class="modal" id="typePreferencesModal" aria-hidden="true" role="dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h2 id="typePreferencesModalTitle">🎯 Task Type Preferences</h2>
            <button class="modal-close" id="closeTypePreferencesModal" aria-label="Close preferences modal">&times;</button>
          </div>
          <div class="modal-body">
            <p class="form-hint">Set preferences to influence auto-allocation. Preferred types will be prioritized, avoided types will be assigned only if necessary.</p>
            <div id="typePreferencesList" class="type-preferences-list"></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary" id="saveTypePreferencesBtn" type="button">Done</button>
          </div>
        </div>
      </div>

      <div class="modal" id="spreadsheetModal" aria-hidden="true" role="dialog">
        <div class="modal-content modal-fullscreen">
          <div class="modal-header">
            <h2>📋 Project Table View</h2>
            <div class="spreadsheet-toolbar">
              <button class="btn btn-small btn-primary" id="addRowBtn" type="button">+ Add Row</button>
              <button class="btn btn-small btn-secondary" id="deleteSelectedRowsBtn" type="button">🗑️ Delete Selected</button>
              <span class="spreadsheet-hint">Edit cells directly • Ctrl+C/V to copy/paste • Changes save automatically</span>
            </div>
            <button class="modal-close" id="closeSpreadsheetModal" aria-label="Close spreadsheet modal">&times;</button>
          </div>
          <div class="modal-body spreadsheet-body">
            <div id="spreadsheetContainer"></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="cancelSpreadsheetBtn">Cancel</button>
            <button class="btn btn-primary" id="saveSpreadsheetBtn">Save Changes</button>
          </div>
        </div>
      </div>

      <div id="toast" class="toast" role="status" aria-live="polite"></div>
    </div>
  `
}
