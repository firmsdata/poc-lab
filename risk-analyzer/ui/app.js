const uploadInput = document.getElementById('drhp-upload');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');
const emptyState = document.getElementById('empty-state');
const results = document.getElementById('results');
const riskCards = document.getElementById('risk-cards');
const resultsFilename = document.getElementById('results-filename');
const resultsSummary = document.getElementById('results-summary');

uploadInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';
  uploadDRHP(file);
});

function showLoading(msg) {
  loadingText.textContent = msg || 'Analysing document...';
  loadingOverlay.classList.add('visible');
}

function hideLoading() {
  loadingOverlay.classList.remove('visible');
}

let currentDocData = {
  total: 0,
  domain: 'Unknown',
  baselineDocs: [],
  highCount: 0,
  needsCount: 0,
  okCount: 0
};

async function uploadDRHP(file) {
  showLoading(`Extracting risks from "${file.name}"… This may take a minute.`);
  emptyState.style.display = 'none';
  results.style.display = 'none';
  riskCards.innerHTML = '';

  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch('/api/upload-drhp', { method: 'POST', body: formData });
    
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Upload failed');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep the last partial line
      
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        
        const streamProgress = document.getElementById('stream-progress');
        
        if (event.type === 'status') {
            loadingText.textContent = event.message;
            if (streamProgress) streamProgress.textContent = event.message;
        } else if (event.type === 'extracted') {
            hideLoading();
            results.style.display = 'block';
            resultsFilename.textContent = event.filename || 'Uploaded Document';
            
            currentDocData = {
              total: event.total_risks || 0,
              domain: event.domain || 'Unknown',
              baselineDocs: event.baseline_documents || [],
              highCount: 0,
              needsCount: 0,
              okCount: 0
            };
            
            if (currentDocData.total === 0) {
              riskCards.innerHTML = '<p class="no-risks-msg">No risk factors were found in this document.</p>';
            }
            updateSummaryUI();
        } else if (event.type === 'risk_feedback') {
            const risk = event.risk;
            if (risk.quality === 'HIGH CONCERN') currentDocData.highCount++;
            else if (risk.quality === 'NEEDS IMPROVEMENT') currentDocData.needsCount++;
            else currentDocData.okCount++;
            
            updateSummaryUI();
            
            // Append risk card
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = buildRiskCard(risk, risk.index);
            riskCards.appendChild(tempDiv.firstElementChild);
            
        } else if (event.type === 'error') {
            throw new Error(event.message);
        } else if (event.type === 'done') {
            // Done streaming
            hideLoading();
            if (streamProgress) streamProgress.textContent = "Done.";
        }
      }
    }
    
    if (buffer.trim()) {
        const event = JSON.parse(buffer);
        // Parse last chunk if needed
    }
  } catch(err) {
      hideLoading();
      emptyState.style.display = 'flex';
      results.style.display = 'none';
      alert(`Error: ${err}`);
  }
}

function updateSummaryUI() {
  const { total, domain, baselineDocs, highCount, needsCount, okCount } = currentDocData;
  let summaryHTML = `${total} risk factor${total !== 1 ? 's' : ''} extracted — ` +
    `${highCount} high concern, ${needsCount} need improvement, ${okCount} adequate.<br/>`;
    
  summaryHTML += `<br/><strong>Classified Domain:</strong> ${escHtml(domain)}<br/>`;
  if (baselineDocs.length > 0) {
    summaryHTML += `<strong>Baseline RHPs:</strong> ${escHtml(baselineDocs.join(', '))}`;
  } else {
    summaryHTML += `<strong>Baseline RHPs:</strong> None available`;
  }

  resultsSummary.innerHTML = summaryHTML;
}

function buildRiskCard(risk, index) {
  const quality = risk.quality || 'ADEQUATE';
  const cls = quality === 'HIGH CONCERN' ? 'concern'
             : quality === 'NEEDS IMPROVEMENT' ? 'needs'
             : 'ok';

  const badgeCls = quality === 'HIGH CONCERN' ? 'badge-concern'
                 : quality === 'NEEDS IMPROVEMENT' ? 'badge-needs'
                 : 'badge-ok';

  const icon = quality === 'HIGH CONCERN' ? '⚠️'
              : quality === 'NEEDS IMPROVEMENT' ? '🔶'
              : '✅';

  // Meta tags
  const metaTags = [risk.domain, risk.category, risk.sub_category]
    .filter(Boolean)
    .map(t => `<span class="meta-tag">${escHtml(t)}</span>`)
    .join('');

  // Description – truncate to 3 lines worth
  const desc = risk.description
    ? `<p class="risk-description">${escHtml(risk.description.slice(0, 600))}${risk.description.length > 600 ? '…' : ''}</p>`
    : '';

  // Feedback block
  let feedback = '';
  if (quality === 'ADEQUATE') {
    feedback = `
      <div class="feedback-block ok">
        <div class="feedback-label">✅ ADEQUATE DISCLOSURE</div>
        <p class="feedback-text">This risk factor meets standard disclosure requirements.</p>
      </div>`;
  } else {
    const issue = risk.issue ? `<p class="feedback-text feedback-issue"><strong>Issue:</strong> ${escHtml(risk.issue)}</p>` : '';
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

  return `
    <div class="risk-card">
      <div class="risk-card-header">
        <div class="risk-title">${index}. ${escHtml(risk.title || 'Untitled Risk')}</div>
        <span class="badge ${badgeCls}">${escHtml(quality)}</span>
      </div>
      ${metaTags ? `<div class="risk-meta">${metaTags}</div>` : ''}
      ${desc}
      ${feedback}
    </div>`;
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
