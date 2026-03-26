    /* ────────────────────────────────────────
       STATE
    ──────────────────────────────────────── */
    let leads = [];
    let results = [];
    let activeLeadIdx = 0;
    let leadCount = 0;
    let demoMode = false;
    let skippedLeads = new Set();

    const PIPELINE_STAGES = [
      'researching company_',
      'finding pain points_',
      'scoring fit_',
    ];

    /* ────────────────────────────────────────
       DEMO MODE
    ──────────────────────────────────────── */
    const DEMO_RESULTS = {
      'Lattice HQ': {
        fitScore: 9,
        fitReason: 'VP of Sales at high-growth SaaS with 800+ employees — direct budget authority over SDR tooling and active pain around rep productivity at scale.',
        research: {
          snapshot: 'Lattice is a people management platform serving over 5,000 companies, offering performance reviews, engagement surveys, and compensation management. They recently crossed $100M ARR and are expanding aggressively into mid-market and enterprise segments.',
          signal: 'Lattice raised a $175M Series F at a $3B valuation and announced plans to double their sales org headcount by Q3 2026.',
          painTags: ['SDR ramp time', 'outbound efficiency', 'pipeline generation', 'rep onboarding'],
          whyFit: 'Doubling their sales team means dozens of new SDRs who need to ramp fast — AI-powered outreach tooling directly addresses their scaling bottleneck.',
        },
      },
      'Rippling': {
        fitScore: 8,
        fitReason: 'Head of RevOps at a unicorn in hypergrowth — owns the sales tech stack and directly evaluates outbound tooling.',
        research: {
          snapshot: 'Rippling is a workforce platform that unifies HR, IT, and finance for businesses. They\'ve grown to over 3,000 employees and serve 10,000+ companies with their all-in-one approach.',
          signal: 'Rippling closed a $200M round at a $13.5B valuation and opened a new sales hub in Austin, adding 150+ GTM roles.',
          painTags: ['sales tech consolidation', 'outbound scaling', 'pipeline velocity'],
          whyFit: 'With 150+ new GTM hires, Rippling needs tooling that gets reps productive from day one without bloating the tech stack.',
        },
      },
      'Loom Inc': {
        fitScore: 7,
        fitReason: 'Director of Growth at a product-led company exploring outbound — strong signal of channel expansion into sales-assisted motions.',
        research: {
          snapshot: 'Loom is an async video messaging platform used by over 25 million people. Now part of Atlassian, they are expanding beyond PLG into enterprise sales-led motions.',
          signal: 'Loom launched Loom AI with auto-summaries and CTAs, and posted 5 enterprise AE positions — a clear shift toward outbound sales.',
          painTags: ['PLG to sales-led transition', 'outbound pipeline', 'enterprise expansion'],
          whyFit: 'Loom\'s shift from pure PLG to outbound sales means they\'re building an SDR function from scratch — the ideal moment for AI-powered outreach tooling.',
        },
      },
      'Deel Global': {
        fitScore: 9,
        fitReason: 'CRO at a $12B company with aggressive global expansion — ultimate decision-maker for sales tooling with clear pain around scaling outbound across markets.',
        research: {
          snapshot: 'Deel is a global payroll and compliance platform operating in 150+ countries, helping companies hire internationally. They\'ve crossed $500M ARR and are one of the fastest-growing SaaS companies globally.',
          signal: 'Deel acquired Assemble and expanded into compensation benchmarking, while opening new sales offices in Dubai and Singapore.',
          painTags: ['global outbound scaling', 'multi-market personalization', 'pipeline generation', 'rep efficiency'],
          whyFit: 'Expanding outbound across Dubai and Singapore markets requires localized, research-heavy personalization at scale — exactly the pain AI SDR tooling solves.',
        },
      },
      'Notion HQ': {
        fitScore: 7,
        fitReason: 'Sales Ops Manager at a high-profile PLG company shifting to enterprise — influences tooling decisions and owns sales process optimization.',
        research: {
          snapshot: 'Notion is an all-in-one workspace for notes, docs, and project management used by millions. They\'ve been aggressively expanding their enterprise offering and recently launched Notion AI across all plans.',
          signal: 'Notion launched a dedicated enterprise sales team and reported 3x growth in enterprise contracts, hiring 40+ account executives.',
          painTags: ['enterprise sales scaling', 'outbound efficiency', 'sales process optimization'],
          whyFit: 'With 40+ new AEs and a nascent outbound motion, Notion\'s sales ops team needs tooling that drives consistent, high-quality outreach without manual process overhead.',
        },
      },
      'HubSpot': {
        fitScore: 8,
        fitReason: 'VP of Business Development at a market-leading CRM company — owns partner and outbound strategy with deep understanding of sales tooling.',
        research: {
          snapshot: 'HubSpot is a leading CRM and inbound marketing platform serving over 200,000 customers globally. They\'ve been expanding aggressively into the enterprise segment and launching AI-powered features across their suite.',
          signal: 'HubSpot launched a new outbound prospecting hub and announced a 40% increase in their enterprise sales team, targeting upmarket expansion.',
          painTags: ['outbound scaling', 'enterprise expansion', 'partner channel development', 'rep productivity'],
          whyFit: 'HubSpot\'s upmarket push means their own BDR team needs the same AI-powered outbound tools they preach to customers — a credibility play and a productivity win.',
        },
      },
      'Figma': {
        fitScore: 8,
        fitReason: 'Head of Sales Enablement at a design-led company scaling enterprise sales — directly owns rep training, tooling, and productivity.',
        research: {
          snapshot: 'Figma is the leading collaborative design platform used by millions of designers and product teams. Post-independence from the Adobe deal, they\'ve doubled down on enterprise sales and expanded into AI-powered design features.',
          signal: 'Figma launched FigJam AI and Dev Mode, and posted 30+ enterprise sales roles — signaling a major push into outbound-driven enterprise deals.',
          painTags: ['sales enablement', 'rep onboarding', 'outbound personalization', 'enterprise pipeline'],
          whyFit: 'With 30+ new enterprise reps ramping, Figma\'s enablement team needs tooling that accelerates onboarding and ensures personalized outreach quality at scale.',
        },
      },
    };

    function getDemoResult(lead, repName, company) {
      if (DEMO_RESULTS[lead.company]) {
        return JSON.parse(JSON.stringify(DEMO_RESULTS[lead.company]));
      }
      // Fallback for unknown companies
      return mockResult(lead, repName, company);
    }

    function toggleDemoMode() {
      demoMode = !demoMode;
      syncDemoToggles();
    }

    function syncDemoToggles() {
      for (let i = 1; i <= 5; i++) {
        const dot = document.getElementById(`demo-dot-${i}`);
        const sw = document.getElementById(`demo-switch-${i}`);
        if (dot) dot.classList.toggle('active', demoMode);
        if (sw) sw.classList.toggle('on', demoMode);
      }
    }

    /* ────────────────────────────────────────
       SCREEN NAVIGATION
    ──────────────────────────────────────── */
    function showScreen(id) {
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      document.getElementById(id).classList.add('active');
    }

    /* ────────────────────────────────────────
       SCREEN 1 — FILE HANDLING
    ──────────────────────────────────────── */
    const dropzone = document.getElementById('dropzone');

    dropzone.addEventListener('dragover', e => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));

    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    });

    function handleFile(input) {
      if (input.files[0]) processFile(input.files[0]);
    }

    function processFile(file) {
      const reader = new FileReader();
      reader.onload = e => {
        const text = e.target.result;
        leads = parseCSV(text);
        leadCount = leads.length;

        // Update UI
        dropzone.classList.add('dz-loaded');
        document.getElementById('dz-title').textContent = `${file.name} · ${leadCount} leads loaded`;
        document.getElementById('dz-sub').textContent = `Ready to run`;

        // config section removed

        const btn = document.getElementById('run-btn');
        btn.classList.add('visible');
        btn.textContent = `Deploy Sales Team on ${leadCount} leads →`;
      };
      reader.readAsText(file);
    }

    function parseCSV(text) {
      const lines = text.trim().split('\n');
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
      return lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim().replace(/['"]/g, ''));
        const obj = {};
        headers.forEach((h, i) => obj[h] = vals[i] || '');
        return obj;
      }).filter(r => r.name || r.company);
    }

    /* ────────────────────────────────────────
       COMMAND CENTER STATE
    ──────────────────────────────────────── */
    let employeeMap = {};   // id -> employee data
    let learnedSkills = []; // accumulated approved skills
    let rejectedSkills = []; // rejected skills (tracked for dedup only)
    let completedLeads = 0;

    const PERSON_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0112 0v1"/></svg>`;

    /* ────────────────────────────────────────
       SCREEN 2 — PIPELINE (now routes to command center)
    ──────────────────────────────────────── */
    function startPipeline() {
      if (!leads.length) return;
      showScreen('screen-command');
      employeeMap = {};
      learnedSkills = [];
      rejectedSkills = [];
      completedLeads = 0;

      const repName    = 'Alex Rivera';
      const company    = 'Acme Corp';
      const productDesc = 'AI-powered sales tooling';

      results = leads.map(() => null);
      document.getElementById('mgr-lead-count').textContent = leads.length;
      document.getElementById('cmd-meta').textContent = `SALES MANAGER · ${leads.length} LEADS`;
      document.getElementById('employee-grid').innerHTML = '';
      document.getElementById('skills-list').innerHTML = '<span class="skills-empty-msg" id="skills-empty">Agents learn skills from handling objections...</span>';
      document.getElementById('activity-feed').innerHTML = '';
      document.getElementById('skills-count').textContent = '(0)';
      document.getElementById('mgr-emp-count').textContent = '0';
      document.getElementById('mgr-skill-count').textContent = '0';
      tlCount = 0;
      document.getElementById('tl-count').textContent = '(0)';
      document.getElementById('tl-list').innerHTML = '<div class="tl-empty" id="tl-empty">Timeline will populate as agents encounter conflicts...</div>';
      kbActiveCount = 0;
      kbRejectedCount = 0;
      document.getElementById('kb-active-count').textContent = '(0)';
      document.getElementById('kb-rejected-count').textContent = '(0)';
      document.getElementById('kb-rejected-list').innerHTML = '<div class="kb-empty" id="kb-rejected-empty">No rejected skills yet.</div>';
      fetch(BASE_URL + '/knowledge-base').then(function(r){return r.json();}).then(function(d){
        if (d.skills && d.skills.length) {
          kbActiveCount = 0; document.getElementById('kb-active-list').innerHTML = '';
          d.skills.forEach(function(s){ addKBEntry(s, s.source_agent || 'Previous batch'); });
        }
      }).catch(function(){});

      if (demoMode) {
        runDemoBatch(repName, company, productDesc);
      } else {
        runBatchSSE(repName, company, productDesc);
      }
    }

    /* ────────────────────────────────────────
       COMMAND CENTER — UI HELPERS
    ──────────────────────────────────────── */
    function addFeedItem(text, cls = '') {
      const feed = document.getElementById('activity-feed');
      const now = new Date().toLocaleTimeString('en-US', {hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit'});
      const div = document.createElement('div');
      div.className = 'feed-item';
      div.innerHTML = `<span class="feed-time">${now}</span><span class="${cls}">${text}</span>`;
      feed.appendChild(div);
      feed.scrollTop = feed.scrollHeight;
    }

    let activeConvKey = {};  // empId -> current leadIdx being shown
    let pulseTimers = {};    // empId -> timeout id for pulse auto-off

    function toggleConversation(empId) {
      const panel = document.getElementById(`emp-conv-${empId}`);
      const chevron = document.getElementById(`emp-chevron-${empId}`);
      if (!panel) return;
      const isCollapsed = panel.classList.contains('collapsed');
      if (isCollapsed) {
        panel.classList.remove('collapsed');
        panel.classList.add('expanded');
        chevron?.classList.add('rotated');
        setTimeout(() => { panel.scrollTop = panel.scrollHeight; }, 350);
      } else {
        panel.classList.remove('expanded');
        panel.classList.add('collapsed');
        chevron?.classList.remove('rotated');
      }
    }

    function updateSummaryBar(empId, leadIdx) {
      const emp = employeeMap[empId];
      if (!emp) return;
      const msgs = emp._convMessages?.[leadIdx] || [];
      const count = msgs.length;
      const countEl = document.getElementById(`emp-msg-count-${empId}`);
      const previewEl = document.getElementById(`emp-preview-${empId}`);
      const pulseEl = document.getElementById(`emp-pulse-${empId}`);
      if (countEl) countEl.textContent = count + (count === 1 ? ' message' : ' messages');
      if (previewEl && count > 0) {
        const last = msgs[count - 1];
        const text = last.role === 'tool_call' ? '🔧 ' + (last.tool || 'tool call') : (last.text || '').replace(/<[^>]*>/g, '');
        previewEl.textContent = text.length > 50 ? text.substring(0, 50) + '...' : text;
      }
      // Pulse the activity dot
      if (pulseEl) pulseEl.classList.add('active');
      clearTimeout(pulseTimers[empId]);
      pulseTimers[empId] = setTimeout(() => {
        if (pulseEl) pulseEl.classList.remove('active');
      }, 3000);
    }

    function addEmployeeCard(emp) {
      const grid = document.getElementById('employee-grid');
      const card = document.createElement('div');
      card.className = 'employee-card';
      card.id = `emp-card-${emp.id}`;
      card.style.animationDelay = (Object.keys(employeeMap).length * 150) + 'ms';

      const tabsHtml = (emp.assigned_leads || []).map((idx, ti) => {
        const l = leads[idx];
        return `<div class="emp-lead-tab ${ti === 0 ? 'active-tab' : ''}" id="emp-tab-${emp.id}-${idx}"
                     onclick="switchEmpConv('${emp.id}', ${idx})">
          <div class="emp-lead-dot dot-waiting" id="emp-dot-${emp.id}-${idx}"></div>
          ${l ? l.name.split(' ')[0] : 'Lead ' + idx}
        </div>`;
      }).join('');

      card.innerHTML = `
        <div class="emp-header">
          <div class="emp-avatar">${PERSON_SVG}</div>
          <div>
            <div class="emp-name">${emp.name}</div>
            <div class="emp-spec">${emp.specialization}</div>
          </div>
          <div class="emp-status-tag idle" id="emp-status-${emp.id}">Idle</div>
        </div>
        <div class="emp-lead-tabs">${tabsHtml}</div>
        <div class="conv-summary-bar" id="emp-summary-${emp.id}" onclick="toggleConversation('${emp.id}')">
          <div class="summary-left">
            <div class="activity-pulse" id="emp-pulse-${emp.id}"></div>
            <span class="summary-msg-count" id="emp-msg-count-${emp.id}">0 messages</span>
            <span class="summary-preview" id="emp-preview-${emp.id}">Waiting for assignment...</span>
          </div>
          <div class="conv-expand-btn" id="emp-chevron-${emp.id}">&#9662;</div>
        </div>
        <div class="emp-conversation collapsed" id="emp-conv-${emp.id}">
          <div class="emp-conv-placeholder">Waiting for assignment...</div>
        </div>
      `;
      grid.appendChild(card);
      employeeMap[emp.id] = emp;
      // Track conversation containers per lead
      emp._convMessages = {};  // leadIdx -> [messages]
      if (emp.assigned_leads?.length) activeConvKey[emp.id] = emp.assigned_leads[0];
      document.getElementById('mgr-emp-count').textContent = Object.keys(employeeMap).length;
    }

    function switchEmpConv(empId, leadIdx) {
      activeConvKey[empId] = leadIdx;
      const emp = employeeMap[empId];
      if (!emp) return;
      // Update tab highlights
      (emp.assigned_leads || []).forEach(idx => {
        const tab = document.getElementById(`emp-tab-${empId}-${idx}`);
        if (tab) tab.classList.toggle('active-tab', idx === leadIdx);
      });
      // Re-render conversation and summary
      renderEmpConv(empId, leadIdx);
      updateSummaryBar(empId, leadIdx);
    }

    function renderEmpConv(empId, leadIdx) {
      const panel = document.getElementById(`emp-conv-${empId}`);
      if (!panel) return;
      const emp = employeeMap[empId];
      const msgs = emp?._convMessages?.[leadIdx] || [];
      if (msgs.length === 0) {
        panel.innerHTML = '<div class="emp-conv-placeholder">Waiting...</div>';
        return;
      }
      const lead = leads[leadIdx];
      const clientName = lead?.name?.split(' ')[0] || 'Client';
      panel.innerHTML = msgs.map(function(m) {
        // Tool call messages
        if (m.role === 'tool_call') {
          var isUse = m.tool === 'use_skill';
          var inp = m.input || {};
          var typeLabel = isUse ? '<span class="tc-type">Skill Applied</span>' : '<span class="tc-type tc-new">New Skill</span>';
          var inputText = isUse
            ? '<b>' + (inp.skill_name || '') + '</b> — ' + (inp.reasoning || '')
            : '<b>' + (inp.skill_name || '') + '</b> — ' + (inp.strategy || '');
          return '<div class="tool-call-bubble"><div class="tc-header"><span class="tc-icon">&#128295;</span><span class="tc-name">' + m.tool + '()</span>' + typeLabel + '</div><div class="tc-input">' + inputText + '</div><div class="tc-result">' + (m.result || '') + '</div></div>';
        }
        // Regular chat messages
        var isSdr = m.role === 'sdr';
        var conflictCls = m.is_conflict ? (m.skill_applied ? ' bubble-skill-applied' : ' bubble-conflict') : '';
        var badge = '';
        if (m.skill_applied && isSdr) { badge = '<span class="skill-applied-badge">Skill Applied: ' + m.skill_applied + '</span>'; }
        else if (m.is_conflict) { badge = '<span class="conflict-badge">' + (isSdr ? 'Response' : 'Objection') + '</span>'; }
        var html = '<div class="chat-bubble ' + (isSdr ? 'bubble-sdr' : 'bubble-client') + conflictCls + '"><div class="bubble-label">' + (isSdr ? emp.name : clientName) + badge + '</div>' + m.text + '</div>';
        if (m.is_conflict && isSdr && m.sdr_reasoning) {
          html += '<div class="reasoning-card" onclick="this.classList.toggle(\'open\')"><div class="reasoning-header">&#129504; AI Reasoning (click to expand)</div><div class="reasoning-body">' + m.sdr_reasoning + (m.conflict_id ? '<div class="reasoning-technique">Technique: ' + m.conflict_id + '</div>' : '') + '</div></div>';
        }
        return html;
      }).join('');
      panel.scrollTop = panel.scrollHeight;
    }

    function updateLeadDot(empId, leadIdx, status) {
      const dot = document.getElementById(`emp-dot-${empId}-${leadIdx}`);
      if (!dot) return;
      if (status === 'active') {
        dot.className = 'emp-lead-dot dot-active';
        const tag = document.getElementById(`emp-status-${empId}`);
        if (tag) { tag.className = 'emp-status-tag active'; tag.textContent = 'Active'; }
        // Auto-switch to this conversation tab (but keep collapsed)
        activeConvKey[empId] = leadIdx;
        const emp2 = employeeMap[empId];
        if (emp2) {
          (emp2.assigned_leads || []).forEach(idx => {
            const t = document.getElementById(`emp-tab-${empId}-${idx}`);
            if (t) t.classList.toggle('active-tab', idx === leadIdx);
          });
          emp2._convMessages[leadIdx] = [];
        }
        renderEmpConv(empId, leadIdx);
        // Activate pulse
        const pulseEl = document.getElementById(`emp-pulse-${empId}`);
        if (pulseEl) pulseEl.classList.add('active');
        const previewEl = document.getElementById(`emp-preview-${empId}`);
        if (previewEl) previewEl.textContent = 'Conversation starting...';
        const countEl = document.getElementById(`emp-msg-count-${empId}`);
        if (countEl) countEl.textContent = '0 messages';
      }
      else if (status === 'done') {
        dot.className = 'emp-lead-dot dot-done';
        // Stop pulse
        const pulseEl = document.getElementById(`emp-pulse-${empId}`);
        if (pulseEl) pulseEl.classList.remove('active');
        // Update summary with final count
        updateSummaryBar(empId, leadIdx);
        // Check if all leads done for this employee
        const emp = employeeMap[empId];
        if (emp) {
          const allDone = emp.assigned_leads.every(idx => {
            const d = document.getElementById(`emp-dot-${empId}-${idx}`);
            return d && d.classList.contains('dot-done');
          });
          if (allDone) {
            const tag = document.getElementById(`emp-status-${empId}`);
            if (tag) { tag.className = 'emp-status-tag done'; tag.textContent = 'Done'; }
          }
        }
      }
      else if (status === 'error') { dot.className = 'emp-lead-dot dot-error'; }
    }

    function addChatBubble(msg, empId, leadIdx) {
      const emp = employeeMap[empId];
      if (!emp) return;
      if (!emp._convMessages[leadIdx]) emp._convMessages[leadIdx] = [];
      emp._convMessages[leadIdx].push(msg);
      // Update summary bar with latest info
      if (activeConvKey[empId] === leadIdx) {
        updateSummaryBar(empId, leadIdx);
      }
      // Only render if this is the currently visible conversation for this employee
      if (activeConvKey[empId] === leadIdx) {
        const panel = document.getElementById(`emp-conv-${empId}`);
        if (!panel) return;
        // Remove placeholder
        const ph = panel.querySelector('.emp-conv-placeholder');
        if (ph) ph.remove();
        const lead = leads[leadIdx];
        const clientName = lead?.name?.split(' ')[0] || 'Client';
        const isSdr = msg.role === 'sdr';
        const div = document.createElement('div');
        div.className = 'chat-bubble ' + (isSdr ? 'bubble-sdr' : 'bubble-client') + (msg.is_conflict ? (msg.skill_applied ? ' bubble-skill-applied' : ' bubble-conflict') : '');
        var conflictBadge = '';
        if (msg.skill_applied && isSdr) { conflictBadge = '<span class="skill-applied-badge">Skill Applied: ' + msg.skill_applied + '</span>'; }
        else if (msg.is_conflict) { conflictBadge = '<span class="conflict-badge">' + (isSdr ? 'Response' : 'Objection') + '</span>'; }
        div.innerHTML = '<div class="bubble-label">' + (isSdr ? emp.name : clientName) + conflictBadge + '</div>' + msg.text;
        panel.appendChild(div);
        // Add reasoning card for SDR conflict responses
        if (msg.is_conflict && isSdr && msg.sdr_reasoning) {
          var rc = document.createElement('div');
          rc.className = 'reasoning-card';
          rc.onclick = function() { rc.classList.toggle('open'); };
          rc.innerHTML = '<div class="reasoning-header">&#129504; AI Reasoning (click to expand)</div><div class="reasoning-body">' + msg.sdr_reasoning + (msg.conflict_id ? '<div class="reasoning-technique">Technique: ' + msg.conflict_id + '</div>' : '') + '</div>';
          panel.appendChild(rc);
        }
        panel.scrollTop = panel.scrollHeight;
      }
    }

    function addSkillToPanel(skill, empName) {
      const list = document.getElementById('skills-list');
      const empty = document.getElementById('skills-empty');
      if (empty) empty.remove();

      const chip = document.createElement('div');
      chip.className = 'skill-chip';
      chip.innerHTML = `
        &#9889; ${skill.skill_name}
        <div class="skill-tooltip">
          ${skill.strategy}
          <div class="skill-tooltip-source">${empName === 'Johnny' ? 'Approved' : 'Learned'} by ${empName}</div>
        </div>
      `;
      list.appendChild(chip);
      learnedSkills.push(skill);
      document.getElementById('skills-count').textContent = `(${learnedSkills.length})`;
      document.getElementById('mgr-skill-count').textContent = learnedSkills.length;
    }

    function showBroadcast(message) {
      return; // disabled
      const bar = document.createElement('div');
      bar.className = 'broadcast-bar';
      bar.innerHTML = `<span class="bc-icon">&#9889;</span> ${message}`;
      document.body.appendChild(bar);
      // Flash all employee cards
      document.querySelectorAll('.employee-card').forEach(c => {
        c.classList.add('skill-flash');
        setTimeout(() => c.classList.remove('skill-flash'), 600);
      });
      setTimeout(() => bar.remove(), 3500);
    }

    /* ── PANEL TOGGLES ── */
    function switchTab(tab) {
      const tabs = ['team', 'kb', 'timeline', 'feed'];
      tabs.forEach(t => {
        document.getElementById('tab-' + t).classList.toggle('active', t === tab);
        document.getElementById('content-' + t).classList.toggle('active', t === tab);
      });
    }

    /* ── KNOWLEDGE BASE ── */
    let kbActiveCount = 0;
    let kbRejectedCount = 0;
    function updateKBTabCount() {
      document.getElementById('kb-count').textContent = '(' + (kbActiveCount + kbRejectedCount) + ')';
    }
    function addKBEntry(skill, agentName) {
      const list = document.getElementById('kb-active-list');
      const empty = document.getElementById('kb-active-empty');
      if (empty) empty.remove();
      const div = document.createElement('div');
      div.className = 'kb-entry';
      const now = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
      div.innerHTML = '<div class="kb-entry-icon">&#9889;</div><div class="kb-entry-content"><div class="kb-entry-name">' + (skill.skill_name||'') + '</div><div class="kb-entry-strategy">' + (skill.strategy||'') + '</div><div class="kb-entry-meta">Learned by ' + agentName + ' &middot; ' + now + '</div></div>';
      list.appendChild(div);
      kbActiveCount++;
      document.getElementById('kb-active-count').textContent = '(' + kbActiveCount + ')';
      updateKBTabCount();
    }
    function addRejectedKBEntry(skill, agentName, reason) {
      const list = document.getElementById('kb-rejected-list');
      const empty = document.getElementById('kb-rejected-empty');
      if (empty) empty.remove();
      const div = document.createElement('div');
      div.className = 'kb-entry kb-entry-rejected';
      const now = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
      div.innerHTML = '<div class="kb-entry-icon">&#10007;</div><div class="kb-entry-content"><div class="kb-entry-name">' + (skill.skill_name||'') + '</div><div class="kb-entry-strategy">' + (skill.strategy||'') + '</div><div class="kb-entry-reason">' + (reason||'') + '</div><div class="kb-entry-meta">Rejected from ' + agentName + ' &middot; ' + now + '</div></div>';
      list.appendChild(div);
      kbRejectedCount++;
      document.getElementById('kb-rejected-count').textContent = '(' + kbRejectedCount + ')';
      updateKBTabCount();
    }

    async function clearKnowledgeBase() {
      try { await fetch(BASE_URL + '/knowledge-base', {method:'DELETE'}); } catch(e) {}
      document.getElementById('kb-active-list').innerHTML = '<div class="kb-empty" id="kb-active-empty">No skills yet — run a batch to start learning...</div>';
      document.getElementById('kb-rejected-list').innerHTML = '<div class="kb-empty" id="kb-rejected-empty">No rejected skills yet.</div>';
      kbActiveCount = 0;
      kbRejectedCount = 0;
      document.getElementById('kb-active-count').textContent = '(0)';
      document.getElementById('kb-rejected-count').textContent = '(0)';
      document.getElementById('kb-count').textContent = '(0)';
    }

    /* ── LEARNING TIMELINE ── */
    let tlCount = 0;
    const TL_ICONS = {
      conflict_detected: {cls: 'conflict', icon: '!'},
      reasoning: {cls: 'reasoning', icon: '?'},
      resolution: {cls: 'resolution', icon: '&#10003;'},
      skill_extracted: {cls: 'skill_extracted', icon: '&#9889;'},
      skill_shared: {cls: 'skill_shared', icon: '&#8594;'},
      skill_applied: {cls: 'skill_extracted', icon: '&#10004;'},
      skill_rejected: {cls: 'skill_rejected', icon: '&#10007;'},
    };
    function addTimelineEvent(evt) {
      const list = document.getElementById('tl-list');
      const empty = document.getElementById('tl-empty');
      if (empty) empty.remove();
      const info = TL_ICONS[evt.event_type] || {cls: 'resolution', icon: '?'};
      const now = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'});
      const div = document.createElement('div');
      div.className = 'tl-event' + (evt.event_type === 'skill_rejected' ? ' tl-rejected' : '');
      const sharedHtml = (evt.shared_with && evt.shared_with.length) ? '<div class="tl-detail" style="color:#3b82f6;">Shared with: ' + evt.shared_with.join(', ') + '</div>' : '';
      div.innerHTML = '<div class="tl-dot ' + info.cls + '">' + info.icon + '</div><div class="tl-content"><div class="tl-agent">' + (evt.agent_name||'') + (evt.lead_name ? ' &rarr; ' + evt.lead_name : '') + '</div><div class="tl-detail">' + (evt.detail||'') + '</div>' + sharedHtml + '<div class="tl-time">' + now + '</div></div>';
      list.appendChild(div);
      list.scrollTop = list.scrollHeight;
      tlCount++;
      document.getElementById('tl-count').textContent = '(' + tlCount + ')';
    }

    /* ── TEACHING MOMENT TOAST ── */
    function showTeachingMoment(data) {
      return; // disabled — was the banner at the top of the screen
      const toast = document.createElement('div');
      toast.className = 'teaching-toast';
      const recipientNames = (data.recipients || []).map(function(r){return r.name;}).join(', ');
      toast.innerHTML = '<span class="teach-icon">&#127891;</span><span><span class="teach-teacher">' + data.teacherName + '</span> taught <span class="teach-skill">"' + (data.skill && data.skill.skill_name || '') + '"</span> to <span class="teach-recipients">' + (recipientNames || 'the team') + '</span></span>';
      document.body.appendChild(toast);
      if (data.teacherId === 'manager') {
        var mgrAv = document.getElementById('mgr-avatar');
        if (mgrAv) { mgrAv.classList.add('thinking'); setTimeout(function(){ mgrAv.classList.remove('thinking'); }, 1500); }
      } else {
        var teacherCard = document.getElementById('emp-card-' + data.teacherId);
        if (teacherCard) {
          teacherCard.classList.add('skill-flash');
          setTimeout(function(){ teacherCard.classList.remove('skill-flash'); }, 600);
        }
      }
      setTimeout(function(){ toast.remove(); }, 4000);
    }

    /* ── TOOL CALL BUBBLE ── */
    function addToolCallBubble(data) {
      var empId = data.employeeId;
      var leadIdx = data.leadIdx;
      var emp = employeeMap[empId];
      if (!emp) return;
      var isUseSkill = data.tool === 'use_skill';
      var toolInput = data.input || {};
      // Store in conversation messages so renderEmpConv can replay them
      if (!emp._convMessages[leadIdx]) emp._convMessages[leadIdx] = [];
      emp._convMessages[leadIdx].push({
        role: 'tool_call',
        tool: data.tool,
        input: toolInput,
        result: data.result || ''
      });
      // Only render if currently visible
      if (activeConvKey[empId] === leadIdx) {
        var panel = document.getElementById('emp-conv-' + empId);
        if (!panel) return;
        var div = document.createElement('div');
        div.className = 'tool-call-bubble';
        var typeLabel = isUseSkill ? '<span class="tc-type">Skill Applied</span>' : '<span class="tc-type tc-new">New Skill</span>';
        var inputText = isUseSkill
          ? '<b>' + (toolInput.skill_name || '') + '</b> — ' + (toolInput.reasoning || '')
          : '<b>' + (toolInput.skill_name || '') + '</b> — ' + (toolInput.strategy || '');
        div.innerHTML = '<div class="tc-header"><span class="tc-icon">&#128295;</span><span class="tc-name">' + data.tool + '()</span>' + typeLabel + '</div><div class="tc-input">' + inputText + '</div><div class="tc-result">' + (data.result || '') + '</div>';
        panel.appendChild(div);
        panel.scrollTop = panel.scrollHeight;
      }
    }

    function markLeadComplete(leadIdx) {
      completedLeads++;
      const pct = Math.round((completedLeads / leads.length) * 100);
      if (completedLeads === leads.length) {
        document.getElementById('mgr-strategy').textContent = `All ${leads.length} leads processed. ${learnedSkills.length} skills learned.`;
        document.getElementById('mgr-avatar').classList.remove('thinking');
        addFeedItem(`All leads complete — ${learnedSkills.length} skills learned`, 'feed-green');
      }
    }

    /* ────────────────────────────────────────
       BACKEND API — SSE BATCH
    ──────────────────────────────────────── */
    const BASE_URL = 'http://localhost:8000';

    async function runBatchSSE(repName, company, productDesc) {
      try {
        const res = await fetch(`${BASE_URL}/run-batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leads, repName, company, productDesc }),
        });

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const parts = buffer.split('\n\n');
          buffer = parts.pop(); // keep incomplete chunk

          for (const part of parts) {
            if (!part.trim()) continue;
            const lines = part.split('\n');
            let event = 'message', data = '';
            for (const line of lines) {
              if (line.startsWith('event: ')) event = line.slice(7);
              if (line.startsWith('data: ')) data = line.slice(6);
            }
            if (!data) continue;
            try {
              handleSSEEvent(event, JSON.parse(data));
            } catch(e) { console.warn('SSE parse error', e); }
          }
        }
      } catch (err) {
        console.error('Batch SSE failed:', err);
        addFeedItem('Connection error — falling back to demo mode', 'feed-amber');
        runDemoBatch('Alex Rivera', 'Acme Corp', 'AI-powered sales tooling');
      }
    }

    function handleSSEEvent(event, data) {
      switch (event) {
        case 'manager_thinking':
          document.getElementById('mgr-strategy').textContent = data.message;
          addFeedItem(data.message, 'feed-amber');
          break;

        case 'manager_plan':
          document.getElementById('mgr-strategy').textContent = data.strategy || 'Delegation plan ready.';
          addFeedItem(`Strategy: ${data.strategy}`, 'feed-green');
          break;

        case 'employee_created':
          addEmployeeCard(data.employee);
          addFeedItem(`Created agent: ${data.employee.name} — ${data.employee.specialization}`, 'feed-green');
          break;

        case 'employee_status':
          updateLeadDot(data.employeeId, data.leadIdx, 'active');
          addFeedItem(`${employeeMap[data.employeeId]?.name || data.employeeId}: ${data.stage} for ${leads[data.leadIdx]?.name || '?'}`);
          break;

        case 'conversation_message':
          addChatBubble(data.message, data.employeeId, data.leadIdx);
          break;

        case 'skill_learned':
          addFeedItem(`${employeeMap[data.employeeId]?.name || data.employeeId} discovered: ${data.skill.skill_name}`, 'feed-amber');
          break;

        case 'manager_reviewing_skill': {
          const mgrAvatar = document.getElementById('mgr-avatar');
          if (mgrAvatar) mgrAvatar.classList.add('thinking');
          document.getElementById('mgr-strategy').textContent = `Reviewing new technique from ${data.employeeName}...`;
          addFeedItem(`Johnny is reviewing "${data.skill.skill_name}" from ${data.employeeName}...`, 'feed-amber');
          break;
        }

        case 'manager_approved_skill': {
          const mgrAvatar2 = document.getElementById('mgr-avatar');
          if (mgrAvatar2) mgrAvatar2.classList.remove('thinking');
          const mgrStrip = document.querySelector('.manager-strip');
          if (mgrStrip) { mgrStrip.classList.add('mgr-approved'); setTimeout(() => mgrStrip.classList.remove('mgr-approved'), 1500); }
          document.getElementById('mgr-strategy').textContent = data.approvalMessage;
          addSkillToPanel(data.skill, 'Johnny');
          addKBEntry(data.skill, data.employeeName);
          addFeedItem(`Johnny approved "${data.skill.skill_name}" — ${data.approvalMessage}`, 'feed-green');
          break;
        }

        case 'manager_rejected_skill': {
          const mgrAvatar3 = document.getElementById('mgr-avatar');
          if (mgrAvatar3) mgrAvatar3.classList.remove('thinking');
          const mgrStrip2 = document.querySelector('.manager-strip');
          if (mgrStrip2) { mgrStrip2.classList.add('mgr-rejected'); setTimeout(() => mgrStrip2.classList.remove('mgr-rejected'), 2000); }
          document.getElementById('mgr-strategy').textContent = `Rejected: ${data.reason}`;
          addFeedItem(`Johnny rejected "${data.skill.skill_name}" from ${data.employeeName} — ${data.reason}`, 'feed-red');
          addRejectedKBEntry(data.skill, data.employeeName, data.reason);
          // Track rejected skill so it doesn't get re-discovered by another employee
          rejectedSkills.push(data.skill);
          break;
        }

        case 'manager_broadcast':
          break;

        case 'tool_call':
          addToolCallBubble(data);
          var tcName = data.tool === 'use_skill' ? 'Applied skill: ' + (data.input?.skill_name || '') : 'New skill: ' + (data.input?.skill_name || '');
          addFeedItem(tcName, data.tool === 'use_skill' ? 'feed-amber' : 'feed-green');
          break;

        case 'conflict_detected':
          addFeedItem(`Conflict: ${data.conflict?.conflict_type || 'objection'} raised in conversation with ${leads[data.leadIdx]?.name || '?'}`, 'feed-amber');
          break;

        case 'conflict_reasoning':
          addFeedItem(`AI reasoning: ${data.technique || 'analyzing'}`, 'feed-amber');
          break;

        case 'teaching_moment':
          showTeachingMoment(data);
          addFeedItem(`Johnny is teaching "${data.skill?.skill_name}" to the team`, 'feed-green');
          break;

        case 'timeline_event':
          addTimelineEvent(data.event);
          break;

        case 'lead_complete':
          updateLeadDot(data.employeeId, data.leadIdx, 'done');
          results[data.leadIdx] = data.result;
          markLeadComplete(data.leadIdx);
          addFeedItem(`${leads[data.leadIdx]?.name || '?'} — conversation complete`, 'feed-green');
          break;

        case 'batch_complete':
          addFeedItem(data.message, 'feed-green');
          break;
      }
    }

    /* ────────────────────────────────────────
       DEMO MODE — SIMULATED BATCH
    ──────────────────────────────────────── */
    const DEMO_MANAGER = {
      strategy: "Three-way split by company stage — enterprise accounts get a consultative specialist, growth-stage startups get an agility-focused rep, and established companies expanding outbound get a relationship builder. Each rep plays to their strength.",
      employees: [
        {
          id: "sdr-1", name: "Maya Chen", specialization: "Enterprise Account Specialist",
          persona: "Consultative, ROI-focused, references industry benchmarks",
          assigned_leads: [0, 1],
          rationale: "VP+ titles at large companies — need senior-level consultative approach"
        },
        {
          id: "sdr-2", name: "Jordan Park", specialization: "Growth-Stage Startup Expert",
          persona: "Energetic, founder-friendly, emphasizes speed to value",
          assigned_leads: [2, 3],
          rationale: "Growth-stage companies exploring new motions — respond to agility messaging"
        },
        {
          id: "sdr-3", name: "Alex Rivera", specialization: "Mid-Market Relationship Builder",
          persona: "Empathetic, relationship-driven, focuses on long-term partnership value",
          assigned_leads: [4, 5, 6],
          rationale: "Established companies expanding sales — need a trust-first, consultative approach"
        }
      ]
    };

    const DEMO_CONVERSATIONS = {
      0: { // Lattice
        messages: [
          {role: "sdr", text: "Hi Sarah, saw Lattice just closed the Series F — congrats. Doubling the sales org is a massive undertaking. Curious how you're thinking about ramping all those new SDRs."},
          {role: "client", text: "Thanks! Yeah it's exciting but honestly a bit overwhelming. We're still figuring out the ramp plan."},
          {role: "sdr", text: "Totally get it. Most teams at your stage tell us their new reps spend 60-70% of their time just researching accounts before sending a single email. What if you could cut that to near zero?"},
          {role: "client", text: "That sounds great in theory but we've looked at tools before and they always require a ton of setup and the output quality isn't there.", is_conflict: true, conflict_id: "Zero-Setup Live Proof"},
          {role: "sdr", text: "Fair concern. What if I ran it live on 5 of your actual target accounts right now — no setup, just your ICP? You'd see the research quality and email output in real-time. Takes 10 minutes.", is_conflict: true, conflict_id: "Zero-Setup Live Proof", sdr_reasoning: "The prospect has been burned by tools before — generic rebuttals won't work. By offering a zero-commitment live demo on THEIR accounts, I eliminate the setup objection and let quality speak for itself."},
          {role: "client", text: "Okay that's actually pretty compelling. Let's do Thursday at 2pm?"},
        ],
        outcome: "meeting_booked",
        objections_handled: [{
          objection: "Tools require too much setup and output quality is poor",
          strategy: "Offer a live demo on their actual accounts with zero setup to prove quality firsthand",
          skill_name: "Zero-Setup Live Proof"
        }],
      },
      1: { // Rippling
        messages: [
          {role: "sdr", text: "Hi Marcus, noticed Rippling is opening the Austin GTM hub — 150+ roles is a serious outbound investment. How are you thinking about the tech stack for those new reps?"},
          {role: "client", text: "We're still evaluating. Honestly our main concern is adding yet another tool to the stack. We already have 6 sales tools.", is_conflict: true, conflict_id: "Stack Consolidation Reframe"},
          {role: "sdr", text: "Makes total sense — tool sprawl is real. What if this actually replaced 2-3 of those tools? We handle research, personalization, and sequencing in one layer. Net reduction in your stack.", is_conflict: true, conflict_id: "Stack Consolidation Reframe", sdr_reasoning: "The prospect's pain isn't about our tool specifically — it's about tool fatigue. Instead of defending adding another tool, I reframe as REMOVING tools. Net reduction is more compelling than net addition."},
          {role: "client", text: "Hmm that's interesting. But I'd need to see hard numbers on how it compares to what we have."},
          {role: "sdr", text: "Absolutely. I can put together a side-by-side comparison specific to your current stack. Would 15 minutes next week work to walk through it?"},
          {role: "client", text: "Sure, send me some times for Tuesday or Wednesday."},
        ],
        outcome: "meeting_booked",
        objections_handled: [{
          objection: "Already have too many sales tools — don't want to add another",
          strategy: "Reframe the tool as a consolidator that replaces 2-3 existing tools, reducing stack complexity",
          skill_name: "Stack Consolidation Reframe"
        }],
      },
      2: { // Loom
        messages: [
          {role: "sdr", text: "Hi Priya, exciting to see Loom going enterprise — the shift from PLG to outbound is one of the toughest GTM pivots. How's the SDR buildout going?"},
          {role: "client", text: "It's early days. We're still not sure if we even need a full SDR team or if we should stay product-led."},
          {role: "sdr", text: "That's the exact right question. What we've seen with other PLG-to-enterprise companies is that you don't need a huge team — you need 2-3 reps who can punch way above their weight with AI handling the research layer."},
          {role: "client", text: "Interesting. But our budget is really tight since this is an experiment for us.", is_conflict: true, conflict_id: "Quick ROI Math"},
          {role: "sdr", text: "Totally understand. Our teams in similar spots typically see ROI within the first month — one booked meeting usually covers the cost. Want me to show you the math specific to Loom's deal sizes? Takes 15 minutes.", is_conflict: true, conflict_id: "Quick ROI Math", sdr_reasoning: "Budget objections from experimental teams need concrete math, not vague promises. By anchoring to 'one meeting covers the cost,' I make the risk feel negligible and frame it as a small experiment — matching their own language."},
          {role: "client", text: "Yeah that would be helpful. Let's do next week."},
        ],
        outcome: "meeting_booked",
        objections_handled: [{
          objection: "Budget is tight since outbound is still experimental",
          strategy: "Show that one booked meeting covers the cost — frame as low-risk experiment with fast ROI math",
          skill_name: "Quick ROI Math"
        }],
      },
      3: { // Deel
        messages: [
          {role: "sdr", text: "Hi James, congrats on the Dubai and Singapore expansion. Scaling outbound across new markets is a beast — are your reps doing localized research manually right now?"},
          {role: "client", text: "Yeah, and it's killing our velocity. But I'm skeptical any AI tool can handle the nuance of different markets.", is_conflict: true, conflict_id: "Market-Specific Live Demo"},
          {role: "sdr", text: "Fair point. Actually, one of our team recently proved this works best with a live demo — mind if I run it on 5 of your actual target accounts in the Singapore market? No setup, you'll see the localization quality in real-time.", is_conflict: true, conflict_id: "Market-Specific Live Demo", sdr_reasoning: "This prospect is skeptical about AI quality — words alone won't convince him. I'm adapting the Zero-Setup Live Proof technique learned from the Lattice conversation, but localizing it to their specific market (Singapore) to directly address the nuance concern.", skill_applied: "Zero-Setup Live Proof"},
          {role: "client", text: "Alright, if you can show me Singapore-specific output that doesn't sound like it was written by someone who's never been to Asia, I'm in."},
          {role: "sdr", text: "Challenge accepted. Let's book 15 minutes and I'll run it live. When works?"},
          {role: "client", text: "How about Friday morning?"},
        ],
        outcome: "meeting_booked",
        objections_handled: [{
          objection: "Skeptical AI can handle multi-market localization nuance",
          strategy: "Used the Zero-Setup Live Proof technique — offered to demonstrate on their actual target market accounts in real-time",
          skill_name: "Market-Specific Live Demo"
        }],
      },
      4: { // Notion
        messages: [
          {role: "sdr", text: "Hi Elena, 40 new AEs at Notion — that's a big bet on outbound. How's the team keeping email quality consistent as you scale?"},
          {role: "client", text: "It's a challenge. Honestly we're seeing quality drop as we onboard new reps. But we've been burned by automation tools that made emails feel robotic.", is_conflict: true, conflict_id: "Research-First Differentiation"},
          {role: "sdr", text: "I hear that a lot — and it's usually because those tools template the email instead of templating the research. We do the opposite: deep research, then the email writes itself from real insights. Quality actually goes up with volume.", is_conflict: true, conflict_id: "Research-First Differentiation", sdr_reasoning: "The prospect equates 'automation' with 'robotic.' I need to break that mental model by distinguishing our approach (research-first) from what burned them before (template-first). This reframes the entire category."},
          {role: "client", text: "That's a different approach. But integrating with our existing tools could be a nightmare given our stack consolidation effort.", is_conflict: true, conflict_id: "Stack Consolidation Reframe"},
          {role: "sdr", text: "Actually, we've helped other teams going through stack consolidation — we can replace the research and personalization layers you're currently doing manually or with multiple tools. Net fewer tools, not more. Want me to put together a quick comparison specific to your stack?", is_conflict: true, conflict_id: "Stack Consolidation Reframe", sdr_reasoning: "Applying the Stack Consolidation Reframe technique learned from the Rippling conversation — reposition as a tool that reduces stack size rather than adding to it. This directly addresses their consolidation initiative.", skill_applied: "Stack Consolidation Reframe"},
          {role: "client", text: "Yeah, let's take a look. Send me some times."},
        ],
        outcome: "meeting_booked",
        objections_handled: [{
          objection: "Previous automation tools made emails feel robotic",
          strategy: "Distinguish between 'templating the email' vs 'templating the research' — position as research-first approach where quality scales with volume",
          skill_name: "Research-First Differentiation"
        }],
      },
      5: { // HubSpot
        messages: [
          {role: "sdr", text: "Hi Rachel, saw HubSpot is doubling down on enterprise outbound — 40% more reps is a big commitment. How are you thinking about keeping outreach quality high as the team scales?"},
          {role: "client", text: "That's the million-dollar question. We're a CRM company — our reps should be the best at outbound. But honestly, even our team struggles with personalization at scale."},
          {role: "sdr", text: "That's actually more common than you'd think. The cobbler's children, right? What we've seen is that even great sales orgs hit a ceiling when research is manual."},
          {role: "client", text: "Maybe, but we already have our own AI features in HubSpot. Why would we need an external tool on top of that?", is_conflict: true, conflict_id: "Complement-Not-Compete Positioning"},
          {role: "sdr", text: "Great question — we're not replacing HubSpot, we're supercharging it. Think of it like this: HubSpot is your system of record, we're the research and personalization engine that feeds it better inputs. Your reps still live in HubSpot, they just start every conversation with deeper context.", is_conflict: true, conflict_id: "Complement-Not-Compete Positioning", sdr_reasoning: "When selling to a company that has competing features, don't argue superiority — position as a complementary layer. Acknowledge their platform's strength and show how you make it better, not replace it."},
          {role: "client", text: "Hmm, that framing makes sense. We've been looking for ways to make the CRM data more actionable."},
          {role: "sdr", text: "Exactly. Want me to show you a quick demo using your own target accounts? You'll see how it plugs into your existing HubSpot workflow."},
          {role: "client", text: "Sure, let's do it. How about next Tuesday?"},
        ],
        outcome: "meeting_booked",
        objections_handled: [{
          objection: "Already have internal AI features — why add an external tool?",
          strategy: "Position as a complementary layer that supercharges their existing platform rather than competing with it",
          skill_name: "Complement-Not-Compete Positioning"
        }],
      },
      6: { // Figma
        messages: [
          {role: "sdr", text: "Hi Alex, saw Figma is hiring 30+ enterprise reps — that's a serious outbound investment. How's the enablement team keeping up with onboarding at that pace?"},
          {role: "client", text: "Barely, if I'm honest. We have great training content but the ramp time is still 3-4 months before reps are fully productive."},
          {role: "sdr", text: "That's pretty standard but painful at your growth rate. What if you could cut that ramp to 4-6 weeks by giving new reps AI-powered research from day one?"},
          {role: "client", text: "We've tried giving reps more tools before and it actually slowed them down. More tabs, more context switching, more cognitive load.", is_conflict: true, conflict_id: "Cognitive Load Reducer"},
          {role: "sdr", text: "That's a really smart observation — and exactly why we built it differently. Instead of adding another tab, we reduce the number of steps. Your reps currently do research across 5-6 sources before writing an email. We collapse that into one click. Net fewer tabs, not more.", is_conflict: true, conflict_id: "Cognitive Load Reducer", sdr_reasoning: "The prospect's objection isn't about tools — it's about cognitive load. Instead of defending the tool, reframe it as a cognitive load REDUCER. Show that it eliminates steps rather than adding them. This flips the narrative from 'another tool' to 'fewer steps.'"},
          {role: "client", text: "Okay that's a different pitch than what I usually hear. Can you show me what that workflow actually looks like?"},
          {role: "sdr", text: "Absolutely. I'll walk you through a live side-by-side — your current workflow vs. with us. Takes 15 minutes and you'll see the difference immediately."},
          {role: "client", text: "Let's do Thursday afternoon."},
        ],
        outcome: "meeting_booked",
        objections_handled: [{
          objection: "More tools slow reps down with cognitive load and context switching",
          strategy: "Reframe the tool as a cognitive load reducer that collapses multiple research steps into one, resulting in fewer tabs not more",
          skill_name: "Cognitive Load Reducer"
        }],
      },
    };

    async function runDemoBatch(repName, company, productDesc) {
      // Manager thinking
      handleSSEEvent('manager_thinking', {message: `Analyzing ${leads.length} leads and their company profiles...`});
      await sleep(2400);

      // Manager plan
      handleSSEEvent('manager_plan', DEMO_MANAGER);
      await sleep(1200);

      // Create employees
      for (const emp of DEMO_MANAGER.employees) {
        handleSSEEvent('employee_created', {employee: emp});
        await sleep(1000);
      }

      await sleep(800);

      // Process all employees in PARALLEL
      var demoSkillCounter = 0;
      // Each employee processes their leads sequentially, but employees run concurrently
      async function processEmployee(emp) {
        for (const leadIdx of emp.assigned_leads) {
          if (leadIdx >= leads.length) continue;

          // Status: researching
          handleSSEEvent('employee_status', {employeeId: emp.id, leadIdx, stage: 'researching company'});
          await sleep(1600 + Math.random() * 800);

          handleSSEEvent('employee_status', {employeeId: emp.id, leadIdx, stage: 'starting conversation'});
          await sleep(800);

          // Stream conversation messages with tool calls injected
          const conv = DEMO_CONVERSATIONS[leadIdx];
          if (conv) {
            for (var mi = 0; mi < conv.messages.length; mi++) {
              var msg = conv.messages[mi];
              var nextMsg = conv.messages[mi + 1];

              handleSSEEvent('conversation_message', {employeeId: emp.id, leadIdx, message: msg});
              await sleep(1000 + Math.random() * 1000);

              // After a client objection, inject a tool_call BEFORE the SDR response
              if (msg.is_conflict && msg.role === 'client' && nextMsg && nextMsg.role === 'sdr') {
                await sleep(600);
                if (nextMsg.skill_applied) {
                  // use_skill tool call — applying a learned technique
                  var skillObj = learnedSkills.find(function(s){return s.skill_name === nextMsg.skill_applied;});
                  handleSSEEvent('tool_call', {
                    employeeId: emp.id, leadIdx: leadIdx,
                    tool: 'use_skill',
                    input: {skill_name: nextMsg.skill_applied, reasoning: nextMsg.sdr_reasoning || ''},
                    result: 'Skill activated: ' + nextMsg.skill_applied + '\nStrategy: ' + (skillObj ? skillObj.strategy : nextMsg.sdr_reasoning) + '\nApply this strategy in your next SDR response.'
                  });
                  handleSSEEvent('timeline_event', {event: {event_type:'skill_applied', agent_name:emp.name, lead_name:leads[leadIdx]?.name||'', detail:'use_skill(' + nextMsg.skill_applied + ') — ' + (nextMsg.sdr_reasoning||'')}});
                } else {
                  // report_new_skill tool call — inventing a new technique
                  var objSkill = conv.objections_handled.find(function(o){return o.skill_name === nextMsg.conflict_id;}) || {};
                  handleSSEEvent('tool_call', {
                    employeeId: emp.id, leadIdx: leadIdx,
                    tool: 'report_new_skill',
                    input: {skill_name: nextMsg.conflict_id || '', strategy: objSkill.strategy || nextMsg.sdr_reasoning || '', objection_type: 'objection'},
                    result: 'New skill registered: ' + (nextMsg.conflict_id||'') + '\nYour team will now learn this technique and can use it in future conversations.'
                  });
                  handleSSEEvent('timeline_event', {event: {event_type:'skill_extracted', agent_name:emp.name, lead_name:leads[leadIdx]?.name||'', detail:'report_new_skill(' + (nextMsg.conflict_id||'') + ') — ' + (objSkill.strategy||'')}});
                }
                await sleep(1200);
                handleSSEEvent('timeline_event', {event: {event_type:'resolution', agent_name:emp.name, lead_name:leads[leadIdx]?.name||'', detail:'Resolved using: ' + (nextMsg.conflict_id||'')}});
                await sleep(400);
              }
            }

            // Skills — routed through Johnny as overseer
            var otherEmps = DEMO_MANAGER.employees.filter(function(e){return e.id !== emp.id;});
            var demoApprovalMsgs = [
              "Excellent find — deploying this to the whole team now.",
              "This is exactly the edge we need. Teaching it to everyone.",
              "Smart technique. I'm making this standard practice.",
              "Good instinct. Sharing this with the rest of the squad.",
            ];
            var demoRejectMsgs = [
              "Too situational — this won't generalize across our leads.",
              "Interesting idea, but too aggressive for our brand voice.",
            ];
            for (const skill of conv.objections_handled) {
              if (!learnedSkills.find(s => s.skill_name === skill.skill_name) && !rejectedSkills.find(s => s.skill_name === skill.skill_name)) {
                demoSkillCounter++;

                // Employee discovers
                handleSSEEvent('skill_learned', {employeeId: emp.id, skill});
                handleSSEEvent('timeline_event', {event: {event_type:'skill_extracted', agent_name:emp.name, lead_name:leads[leadIdx]?.name||'', detail:'Learned: ' + skill.skill_name + ' — ' + skill.strategy}});
                await sleep(600);

                // Johnny reviews
                handleSSEEvent('manager_reviewing_skill', {employeeId: emp.id, employeeName: emp.name, skill});
                await sleep(2000);

                var isRejected = demoSkillCounter === 5;
                if (isRejected) {
                  var rejectMsg = demoRejectMsgs[demoSkillCounter % demoRejectMsgs.length];
                  handleSSEEvent('manager_rejected_skill', {employeeId: emp.id, employeeName: emp.name, skill, reason: rejectMsg});
                  handleSSEEvent('timeline_event', {event: {event_type:'skill_rejected', agent_name:'Johnny', lead_name:leads[leadIdx]?.name||'', detail:'Rejected "' + skill.skill_name + '" from ' + emp.name + ' — ' + rejectMsg}});
                  await sleep(800);
                  handleSSEEvent('manager_broadcast', {
                    message: `Johnny reviewed "${skill.skill_name}" from ${emp.name} but decided to pass — ${rejectMsg}`,
                    skill
                  });
                } else {
                  var approveMsg = demoApprovalMsgs[demoSkillCounter % demoApprovalMsgs.length];
                  handleSSEEvent('manager_approved_skill', {employeeId: emp.id, employeeName: emp.name, skill, approvalMessage: approveMsg});
                  handleSSEEvent('timeline_event', {event: {event_type:'skill_extracted', agent_name:'Johnny', lead_name:leads[leadIdx]?.name||'', detail:'Approved "' + skill.skill_name + '" — ' + approveMsg}});
                  await sleep(600);
                  handleSSEEvent('teaching_moment', {
                    teacherName: 'Johnny',
                    teacherId: 'manager',
                    skill: skill,
                    recipients: otherEmps.map(function(e){return {id:e.id, name:e.name};}),
                    timestamp: Date.now()/1000,
                  });
                  handleSSEEvent('timeline_event', {event: {event_type:'skill_shared', agent_name:'Johnny', lead_name:leads[leadIdx]?.name||'', detail:'Johnny is teaching "' + skill.skill_name + '" to the team', shared_with:otherEmps.map(function(e){return e.name;})}});
                  await sleep(800);
                  handleSSEEvent('manager_broadcast', {
                    message: `Johnny approved "${skill.skill_name}" from ${emp.name} and is teaching it to the team.`,
                    skill
                  });
                }
                await sleep(1200);
              }
            }

            // Build result compatible with review screen
            const result = {
              fitScore: [9, 8, 7, 9, 7, 8, 8][leadIdx] || 7,
              fitReason: emp.rationale,
              research: DEMO_RESULTS[leads[leadIdx]?.company]?.research || {
                snapshot: 'Fast-growing company', signal: 'Expanding sales team',
                painTags: ['outbound efficiency'], whyFit: 'Strong fit for AI SDR tooling'
              },
              conversation: conv.messages,
              outcome: conv.outcome,
            };
            handleSSEEvent('lead_complete', {employeeId: emp.id, leadIdx, result});
          }

          await sleep(600);
        }
      }

      // Fire all employees at once — they run their conversations simultaneously
      await Promise.all(DEMO_MANAGER.employees.map(emp => processEmployee(emp)));

      handleSSEEvent('batch_complete', {
        message: `All ${leads.length} leads processed. ${learnedSkills.length} skills learned across the team.`,
        totalSkills: learnedSkills.length,
        skills: learnedSkills,
      });
    }

    async function callAgentAPI(lead, repName, company, productDesc) {
      const res = await fetch(`${BASE_URL}/run-lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead, repName, company, productDesc }),
      });
      if (!res.ok) throw new Error('API error');
      return res.json();
    }

    /* ────────────────────────────────────────
       MOCK FALLBACK (demo safety net)
    ──────────────────────────────────────── */
    function mockResult(lead, repName, company) {
      const score = 6 + Math.floor(Math.random() * 4);
      return {
        fitScore: score,
        fitReason: `${lead.title} at a high-growth company — strong fit for outbound automation.`,
        research: {
          snapshot:  `${lead.company} is a fast-growing B2B software company. Recently expanded their sales team and investing in go-to-market infrastructure.`,
          signal:    `${lead.company} posted 3 open SDR roles last month — strong signal of outbound scaling effort.`,
          painTags:  ['SDR ramp time', 'outbound efficiency', 'pipeline generation'],
          whyFit:    `${lead.title} typically owns SDR budget and has direct pain around rep productivity and pipeline quality.`,
        },
      };
    }

    /* ────────────────────────────────────────
       SCREEN 3 — REVIEW
    ──────────────────────────────────────── */

    /* ────────────────────────────────────────
       SCREEN 6 — ANALYTICS DASHBOARD
    ──────────────────────────────────────── */
    function goToAnalytics() {
      const totalLeads = leads.length;
      const skippedCount = skippedLeads.size;
      const processedCount = results.filter(Boolean).length;

      // Fit score stats
      let totalFit = 0;
      let fitCount = 0;
      results.forEach(r => {
        if (r && r.fitScore) { totalFit += r.fitScore; fitCount++; }
      });
      const avgFit = fitCount > 0 ? (totalFit / fitCount).toFixed(1) : '—';

      // Stats cards
      document.getElementById('analytics-stats').innerHTML = `
        <div class="stat-card">
          <div class="stat-num default">${totalLeads}</div>
          <div class="stat-label">Total leads</div>
        </div>
        <div class="stat-card">
          <div class="stat-num green">${processedCount}</div>
          <div class="stat-label">Processed</div>
        </div>
        <div class="stat-card">
          <div class="stat-num red">${skippedCount}</div>
          <div class="stat-label">Skipped</div>
        </div>
        <div class="stat-card">
          <div class="stat-num green">${avgFit}</div>
          <div class="stat-label">Avg fit score</div>
        </div>
      `;

      // Funnel bars
      const pct = n => totalLeads > 0 ? Math.round((n / totalLeads) * 100) : 0;
      document.getElementById('analytics-funnel').innerHTML = `
        <div class="funnel-bar-wrap">
          <div class="funnel-bar-label">Processed</div>
          <div class="funnel-bar-track">
            <div class="funnel-bar-fill green" style="width:${pct(processedCount)}%">${pct(processedCount)}%</div>
          </div>
        </div>
        <div class="funnel-bar-wrap">
          <div class="funnel-bar-label">Skipped</div>
          <div class="funnel-bar-track">
            <div class="funnel-bar-fill red" style="width:${pct(skippedCount)}%">${pct(skippedCount)}%</div>
          </div>
        </div>
      `;

      // Lead breakdown table
      const tbody = document.getElementById('analytics-tbody');
      tbody.innerHTML = '';
      leads.forEach((lead, i) => {
        const result = results[i];
        let status, statusClass;
        if (skippedLeads.has(i)) { status = 'Skipped'; statusClass = 'skipped'; }
        else if (result) { status = 'Processed'; statusClass = 'sent'; }
        else { status = 'Pending'; statusClass = 'pending'; }

        const fitScore = result?.fitScore || '—';

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${lead.name}</td>
          <td>${lead.company}</td>
          <td>${fitScore}/10</td>
          <td><span class="status-badge ${statusClass}">${status}</span></td>
        `;
        tbody.appendChild(tr);
      });

      showScreen('screen-analytics');
    }

    /* ────────────────────────────────────────
       UTILS
    ──────────────────────────────────────── */
    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
