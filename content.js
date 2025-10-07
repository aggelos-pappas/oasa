// Boot log to verify content script injection
console.log('[OASA] Content script loaded on', location.href);
window.addEventListener('DOMContentLoaded', () => {
    console.log('[OASA] DOMContentLoaded');
});

// Fetch lines data from OASA API via background script to avoid CORS
let lines_data = null;
let routeNameCache = Object.create(null);
chrome.runtime.sendMessage(
    {
        type: 'OASA_FETCH',
        payload: {
            url: 'https://telematics.oasa.gr/api/?act=webGetLines',
            options: { method: 'POST' }
        }
    },
    (response) => {
        if (response && response.ok) {
            lines_data = response.data;
            console.log('[OASA] lines_data loaded:', lines_data);
        } else {
            console.error('[OASA] Failed to fetch lines_data:', response && response.error);
        }
    }
);



function findStopCodeInPanel() {
    // Αναζητάμε το <span> που περιέχει το 'Αναγνωριστικό στάσης:'
    let span = Array.from(document.querySelectorAll('span')).find(
        el => el.textContent.trim().startsWith('Αναγνωριστικό στάσης:')
    );
    if (span) {
        let match = span.textContent.match(/Αναγνωριστικό στάσης:\s*(\d{3,})/);
        if (match) {
            console.log('[OASA] Found stop code in panel:', match[1]);
            return match[1];
        }
        console.log('[OASA] Panel span found but stop code did not match pattern');
    } else {
        console.log('[OASA] No panel span containing stop code label was found');
    }
    return null;
}

function showArrivalsPopup(stopcode, arrivalsHtml) {
	let popup = document.getElementById('oasa-arrivals-popup');
	if (!popup) {
		popup = document.createElement('div');
		popup.id = 'oasa-arrivals-popup';
		popup.style = `
			position:fixed;top:120px;right:25px;
			z-index:9999;
			padding:0;
			min-width:240px;
			background:#0130a6;
			border-radius:10px;
			box-shadow:0 4px 16px #222;
			color:#fff;
			font-family:sans-serif;
			overflow:hidden;
		`;

		// Add OASA logo in the lower left corner
		const logo = document.createElement('img');
		logo.src = 'https://www.gov.gr/media/organization/logo/2021/11/24/oasa_vU1TpxQ.png';
		logo.alt = 'OASA logo';
		logo.style.position = 'absolute';
		logo.style.left = '15px';
		logo.style.bottom = '10px';
		logo.style.width = '48px';
        logo.style.border = '1px solid #fff';
		logo.style.height = 'auto';
		logo.style.backgroundColor = 'white';
		logo.style.borderRadius = '6px';
		logo.style.boxShadow = '0 2px 8px #2224';
		logo.style.padding = '2px';

		popup.appendChild(logo);

		document.body.appendChild(popup);
	}

	let html = '';
	if (arrivalsHtml && arrivalsHtml.length) {
		html = arrivalsHtml;
	} else {
		html = '<div style="padding:16px 12px;">No arrivals.</div>';
	}
	popup.innerHTML = html + `
		<button onclick="document.getElementById('oasa-arrivals-popup').remove();" style="all:unset;float:right;cursor:pointer;font-size:1.2em;padding:10px;color:#fff;">✕</button>
	`;
}
function getLineNameAndNumber(routecode) {
	const key = String(routecode || '');
	if (!key) return Promise.resolve('');
	if (routeNameCache[key]) return Promise.resolve(routeNameCache[key]);
	return new Promise((resolve) => {
		const url = 'https://telematics.oasa.gr/api/?act=getRouteName';
		const options = {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: `p1=${encodeURIComponent(key)}`
		};
		chrome.runtime.sendMessage(
			{ type: 'OASA_FETCH', payload: { url, options } },
			(resp) => {
				if (!resp || !resp.ok) {
					return resolve('');
				}
				const data = resp.data;
				let name = '';
				if (Array.isArray(data) && data.length > 0) {
					name = data[0] && (data[0].route_departure_eng || data[0].route_departure) || '';
				}
				routeNameCache[key] = name;
				resolve(name);
			}
		);
	});
}
function fetchAndShowArrivals(stopcode) {
    const url = `https://telematics.oasa.gr/api/?act=getStopArrivals&p1=${stopcode}`;
    console.log('[OASA] Fetching arrivals for stop', stopcode, '→', url);
    chrome.runtime.sendMessage(
        { type: 'OASA_FETCH', payload: { url, options: { method: 'GET' } } },
        (resp) => {
            if (!resp) {
                console.error('[OASA] Background fetch no response');
                showArrivalsPopup(stopcode, "API error or unavailable.");
                return;
            }
            const { ok, status, data: arrivals, error } = resp;
            console.log('[OASA] Arrivals response status', status, 'ok:', ok);
            if (!ok) {
                console.error('[OASA] Background fetch error', error);
                showArrivalsPopup(stopcode, "API error or unavailable.");
                return;
            }
            let html = "No current arrivals";
            if (Array.isArray(arrivals) && arrivals.length > 0) {
                Promise.all(arrivals.map(async (a) => {
                    const minutes = a && a.btime2 ? a.btime2 : '';
                    const name = await getLineNameAndNumber(a.route_code);
                    const displayName = name || (a && a.route_code) || '';
                    return `
                    <div style="padding:16px 12px 10px 12px; margin:0; border-bottom:1px solid #1a287c; background:#0130a6; height:2em;display:flex;align-items:center; justify-content:space-between;position:relative;">
                        <span style="font-size:0.8em; font-weight:bold;">${displayName}</span>
                        <div style="float:right; text-align:right; color:${Number(minutes) < 5 ? '#ff3b3b' : '#00ec6e'}; font-size:2em; font-weight:600;">${minutes}'</div>
                    </div>`;
                }))
                .then(rows => {
                    showArrivalsPopup(stopcode, rows.join(""));
                })
                .catch(() => {
                    html = arrivals.map((a) => {
                        const minutes = a && a.btime2 ? a.btime2 : '';
                        const fallback = (a && a.route_code) || '';
                        return `
                        <div style="padding:16px 12px 10px 12px; margin:0; border-bottom:1px solid #1a287c; background:#0130a6; height:2em;display:flex;align-items:center; justify-content:space-between;position:relative;">
                            <span style="font-size:0.8em; font-weight:bold;">${fallback}</span>
                            <div style="float:right; text-align:right; color:#00ec6e; font-size:2em; font-weight:600;">${minutes}'</div>
                        </div>`;
                    }).join("");
                    showArrivalsPopup(stopcode, html);
                });
                return;
            }
            showArrivalsPopup(stopcode, html);
        }
    );
}

// Listen for clicks that open the station panel
document.body.addEventListener('click', () => {
    console.log('[OASA] Body click detected; scheduling stop code scan');
    setTimeout(() => {
        const stopcode = findStopCodeInPanel();
        if (stopcode) {
            console.log('[OASA] Triggering arrivals fetch for stop', stopcode);

            fetchAndShowArrivals(stopcode);
        } else {
            console.log('[OASA] No stop code detected after click');
        }
    }, 600); // delay to let panel DOM populate
});

