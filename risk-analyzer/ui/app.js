const uploadInput     = document.getElementById('drhp-upload');
const loadingOverlay  = document.getElementById('loading-overlay');
const loadingText     = document.getElementById('loading-text');
const emptyState      = document.getElementById('empty-state');
const results         = document.getElementById('results');
const riskCards       = document.getElementById('risk-cards');
const resultsFilename = document.getElementById('results-filename');
const resultsSummary  = document.getElementById('results-summary');
const streamProgress  = document.getElementById('stream-progress');

uploadInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';
  uploadDRHP(file);
});

/* ── Full-screen overlay (used only for the initial HTTP round-trip) ── */
function showLoading(msg) {
  loadingText.textContent = msg || 'Analysing document...';
  loadingOverlay.classList.add('visible');
}
function hideLoading() {
  loadingOverlay.classList.remove('visible');
}

/* ── Inline stream-progress badge ── */
function setStreamStatus(msg, done) {
  if (!streamProgress) return;
  streamProgress.textContent = msg || '';
  if (done) {
    streamProgress.className = 'badge badge-ok';
  } else {
    streamProgress.className = 'badge badge-needs';
  }
}

let currentDocData = {
  total: 0,
  domain: 'Unknown',
  baselineDocs: [],
  highCount: 0,
  needsCount: 0,
  okCount: 0,
  sectionFindings: []
};

async function uploadDRHP(file) {
  /* Show results panel immediately so streamed cards are visible */
  emptyState.style.display  = 'none';
  results.style.display     = 'block';
  riskCards.innerHTML       = '';
  resultsFilename.textContent = file.name;
  resultsSummary.textContent  = '';
  setStreamStatus(`Uploading "${file.name}"…`);

  /* Small spinner overlay only while waiting for the server to respond */
  showLoading(`Uploading "${file.name}"…`);

  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch('/api/upload-drhp?stream=false', { method: 'POST', body: formData });

    /* Dismiss full-screen overlay as soon as HTTP headers arrive */
    hideLoading();

    if (!response.ok) {
      let detail = 'Upload failed';
      try { detail = (await response.json()).detail || detail; } catch (_) {}
      throw new Error(detail);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      
      resultsFilename.textContent = data.filename || file.name;
      currentDocData = {
        total:           data.total_risks || 0,
        domain:          data.domain || 'Unknown',
        baselineDocs:    data.baseline_documents || [],
        highCount:       0,
        needsCount:      0,
        okCount:         0,
        sectionFindings: data.section_findings || [],
      };
      
      if (currentDocData.total === 0) {
        riskCards.innerHTML = '<p class="no-risks-msg">No risk factors were found in this document.</p>';
      }
      updateSummaryUI();
      
      const risks = data.risks || [];
      for (let i = 0; i < risks.length; i++) {
        const risk = risks[i];
        
        if      (risk.quality === 'HIGH CONCERN')      currentDocData.highCount++;
        else if (risk.quality === 'NEEDS IMPROVEMENT') currentDocData.needsCount++;
        else                                           currentDocData.okCount++;

        updateSummaryUI();
        setStreamStatus(`Analysing risk ${risk.index} of ${currentDocData.total}…`);

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = buildRiskCard(risk, risk.index);
        const card = tempDiv.firstElementChild;
        riskCards.appendChild(card);
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        
        // Brief 80ms delay per card for smooth transition
        await new Promise(resolve => setTimeout(resolve, 80));
      }
      
      setStreamStatus('Analysis complete', true);
      return;
    }

    const reader  = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let   buffer  = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep the (possibly partial) last line

      for (const line of lines) {
        if (!line.trim()) continue;
        let event;
        try { event = JSON.parse(line); } catch (_) { continue; }

        if (event.type === 'status') {
          setStreamStatus(event.message);

        } else if (event.type === 'extracted') {
          resultsFilename.textContent = event.filename || file.name;
          currentDocData = {
            total:           event.total_risks || 0,
            domain:          event.domain || 'Unknown',
            baselineDocs:    event.baseline_documents || [],
            highCount:       0,
            needsCount:      0,
            okCount:         0,
            sectionFindings: event.section_findings || [],
          };
          if (currentDocData.total === 0) {
            riskCards.innerHTML = '<p class="no-risks-msg">No risk factors were found in this document.</p>';
          }
          setStreamStatus(`Extracted ${currentDocData.total} risk${currentDocData.total !== 1 ? 's' : ''} — analysing…`);
          updateSummaryUI();

        } else if (event.type === 'risk_feedback') {
          const risk = event.risk;
          if      (risk.quality === 'HIGH CONCERN')      currentDocData.highCount++;
          else if (risk.quality === 'NEEDS IMPROVEMENT') currentDocData.needsCount++;
          else                                           currentDocData.okCount++;

          updateSummaryUI();
          setStreamStatus(`Analysing risk ${risk.index} of ${currentDocData.total}…`);

          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = buildRiskCard(risk, risk.index);
          const card = tempDiv.firstElementChild;
          riskCards.appendChild(card);
          /* Scroll new card into view so the user sees live progress */
          if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        } else if (event.type === 'error') {
          throw new Error(event.message);

        } else if (event.type === 'done') {
          setStreamStatus('Analysis complete', true);
        }
      }
    }

    /* Handle any residual data sitting in the buffer */
    if (buffer.trim()) {
      try {
        const event = JSON.parse(buffer);
        if (event.type === 'done') setStreamStatus('Analysis complete', true);
      } catch (_) {}
    }

  } catch (err) {
    hideLoading();
    /* Show the error in the status badge; keep any cards already rendered */
    setStreamStatus(`\u26A0\uFE0F ${err.message || err}`);
    if (streamProgress) streamProgress.className = 'badge badge-concern';

    /* If nothing rendered yet, fall back to the empty state */
    if (!riskCards.firstElementChild) {
      results.style.display    = 'none';
      emptyState.style.display = 'flex';
      alert(`Error: ${err}`);
    }
  }
}

function updateSummaryUI() {
  const { total, domain, baselineDocs, highCount, needsCount, okCount, sectionFindings } = currentDocData;
  
  let summaryHTML = `
    <div class="stats-counter-bar">
      <div class="stat-counter-card ok">
        <span class="stat-count-number">${okCount}</span>
        <span class="stat-count-label">Adequate</span>
      </div>
      <div class="stat-counter-card needs">
        <span class="stat-count-number">${needsCount}</span>
        <span class="stat-count-label">Needs Work</span>
      </div>
      <div class="stat-counter-card concern">
        <span class="stat-count-number">${highCount}</span>
        <span class="stat-count-label">Concern</span>
      </div>
    </div>
    
    <div class="doc-meta-info">
      <strong>Classified Domain:</strong> <span class="badge-tag">${escHtml(domain)}</span>
  `;
  
  if (baselineDocs.length > 0) {
    summaryHTML += ` | <strong>Baseline RHPs:</strong> ${escHtml(baselineDocs.join(', '))}`;
  } else {
    summaryHTML += ` | <strong>Baseline RHPs:</strong> None available`;
  }
  summaryHTML += `</div>`;

  if (sectionFindings && sectionFindings.length > 0) {
    summaryHTML += `<div class="section-findings">
      <strong>Rulebook coverage:</strong>
      ${sectionFindings.map(f => `<span>${escHtml(f.message || f.title)}</span>`).join('')}
    </div>`;
  }

  resultsSummary.innerHTML = summaryHTML;
}

function buildRiskCard(risk, index) {
  const quality  = risk.quality || 'ADEQUATE';
  const cls      = quality === 'HIGH CONCERN'      ? 'concern'
                 : quality === 'NEEDS IMPROVEMENT'  ? 'needs'
                 :                                    'ok';
  const badgeCls = quality === 'HIGH CONCERN'      ? 'badge-concern'
                 : quality === 'NEEDS IMPROVEMENT'  ? 'badge-needs'
                 :                                    'badge-ok';
  const icon     = quality === 'HIGH CONCERN'      ? '\u26A0\uFE0F'
                 : quality === 'NEEDS IMPROVEMENT'  ? '\uD83D\uDD36'
                 :                                    '\u2705';

  const metaTags = [risk.domain, risk.category, risk.sub_category]
    .filter(Boolean)
    .map(t => `<span class="meta-tag">${escHtml(t)}</span>`)
    .join('');

  const desc = risk.description
    ? `<p class="risk-description">${escHtml(risk.description.slice(0, 600))}${risk.description.length > 600 ? '\u2026' : ''}</p>`
    : '';

  let feedback = '';
  if (quality === 'ADEQUATE') {
    feedback = `
      <div class="feedback-block ok">
        <div class="feedback-label">\u2705 ADEQUATE DISCLOSURE</div>
        <p class="feedback-text">This risk factor meets standard disclosure requirements.</p>
      </div>`;
  } else {
    const issue       = risk.issue
      ? `<p class="feedback-text feedback-issue"><strong>Issue:</strong> ${escHtml(risk.issue)}</p>`
      : '';
    const improvement = risk.improvement
      ? `<p class="feedback-text feedback-improvement"><strong>Suggested improvement:</strong> ${escHtml(risk.improvement)}</p>`
      : '';
    feedback = `
      <div class="feedback-block ${cls}">
        <div class="feedback-label">${icon} ${escHtml(quality)}</div>
        ${issue}
        ${improvement}
      </div>`;
  }

  const rulebookFindings = Array.isArray(risk.rulebook_findings) && risk.rulebook_findings.length > 0
    ? `<div class="rulebook-block">
        <div class="rulebook-heading">DRHP rulebook findings</div>
        ${risk.rulebook_findings.map(buildRulebookFinding).join('')}
      </div>`
    : '';

  return `
    <div class="risk-card">
      <div class="risk-card-header">
        <div class="risk-title">${index}. ${escHtml(risk.title || 'Untitled Risk')}</div>
        <span class="badge ${badgeCls}">${escHtml(quality)}</span>
      </div>
      ${metaTags ? `<div class="risk-meta">${metaTags}</div>` : ''}
      ${desc}
      ${feedback}
      ${rulebookFindings}
    </div>`;
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}

function buildRulebookFinding(finding) {
  const terms = Array.isArray(finding.matched_terms) && finding.matched_terms.length > 0
    ? `<div class="rulebook-terms">Matched: ${finding.matched_terms.map(escHtml).join(', ')}</div>`
    : '';
  const source = finding.source_url
    ? `<a href="${escAttr(finding.source_url)}" target="_blank" rel="noopener">Source</a>`
    : '';

  return `
    <div class="rulebook-finding">
      <div class="rulebook-title">
        <span>${escHtml(finding.title || finding.code)}</span>
        <span class="rulebook-severity">${escHtml(finding.severity || '')}</span>
      </div>
      <p>${escHtml(finding.suggestion || finding.message || '')}</p>
      ${terms}
      ${source}
    </div>`;
}

function escAttr(str) {
  return escHtml(str).replace(/'/g, '&#39;');
}
