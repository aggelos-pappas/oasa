// Boot log to verify content script injection
console.log('[OASA] Content script loaded on', location.href);
window.addEventListener('DOMContentLoaded', () => {
    console.log('[OASA] DOMContentLoaded');
});

// Fetch lines data from OASA API via background script to avoid CORS
let lines_data = null;
let routeNameCache = Object.create(null);
let oasaRefreshTimer = null;
let oasaCurrentStop = null;
let oasaStopObserverStarted = false;
let oasaStopObserver = null;
let oasaStopDebounceTimer = null;
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

        // Create persistent structure: top handle, content, bottom handle, close, logo
        const topHandle = document.createElement('div');
        topHandle.id = 'oasa-popup-handle-top';
        topHandle.style.cssText = 'height:16px; cursor:grab; background:#0a3dd0; display:flex; align-items:center; justify-content:center;';
        // 3x2 grip icon (six dots) centered in the handle
        const gripSvgNS = 'http://www.w3.org/2000/svg';
        const grip = document.createElementNS(gripSvgNS, 'svg');
        grip.setAttribute('width', '18');
        grip.setAttribute('height', '12');
        grip.setAttribute('viewBox', '0 0 18 12');
        const dotPositions = [ [3,4], [9,4], [15,4], [3,8], [9,8], [15,8] ];
        dotPositions.forEach(([cx, cy]) => {
            const c = document.createElementNS(gripSvgNS, 'circle');
            c.setAttribute('cx', String(cx));
            c.setAttribute('cy', String(cy));
            c.setAttribute('r', '1.5');
            c.setAttribute('fill', '#ffffff');
            c.setAttribute('fill-opacity', '0.95');
            grip.appendChild(c);
        });
        topHandle.appendChild(grip);

        const contentContainer = document.createElement('div');
        contentContainer.id = 'oasa-popup-content';
        contentContainer.style.cssText = 'position:relative; overflow:visible;';

        // Fade overlay for scroll hint
        const fade = document.createElement('div');
        fade.id = 'oasa-popup-fade';
        fade.style.cssText = 'position:absolute;left:0;right:0;bottom:0;height:24px;background:linear-gradient(180deg, rgba(1,48,166,0) 0%, #0130a6 90%);pointer-events:none;display:none;';
        contentContainer.appendChild(fade);

        // Footer with full-width logo (also acts as bottom drag handle)
        const footer = document.createElement('div');
        footer.id = 'oasa-popup-footer';
        footer.style.cssText = 'position:relative;height:56px;cursor:grab;overflow:hidden;border-top:1px solid #1a287c;display:flex;align-items:center;';
        const logo = document.createElement('img');
        logo.src = 'https://www.gov.gr/media/organization/logo/2021/11/24/oasa_vU1TpxQ.png';
        logo.alt = 'OASA logo';
        logo.style.cssText = 'height:50%;background:white;width:auto;margin-left:1em;';
        logo.style.borderRadius = '6px';
        logo.style.boxShadow = '0 2px 8px #2224';
        logo.style.padding = '2px';
        footer.appendChild(logo);

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = 'all:unset;position:absolute;bottom:6px;right:8px;cursor:pointer;font-size:1.2em;padding:6px 8px;color:#fff;text-shadow:0 1px 2px #000;';
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            popup.remove();
            if (oasaRefreshTimer) {
                clearInterval(oasaRefreshTimer);
                oasaRefreshTimer = null;
            }
        });

        popup.appendChild(topHandle);
        popup.appendChild(contentContainer);
        popup.appendChild(footer);
        popup.appendChild(closeBtn);

        // Attach drag behavior for both handles (top and footer)
        makePopupDraggable(popup, [topHandle, footer]);

        document.body.appendChild(popup);

        // Start auto-refresh after creating the popup
        ensureArrivalsAutoRefresh();
        // Inject minimal scrollbar styling once
        ensureMinimalScrollbarStyles();
    }

    // Update content only
    const content = document.getElementById('oasa-popup-content');
    let html = '';
    if (arrivalsHtml && arrivalsHtml.length) {
        html = arrivalsHtml;
    } else {
        html = '<div style="padding:16px 12px;">No arrivals.</div>';
    }
    if (content) {
        content.innerHTML = html;
        applyScrollableBehavior(content);
    }
}

function ensureArrivalsAutoRefresh() {
    if (oasaRefreshTimer) return;
    oasaRefreshTimer = setInterval(() => {
        const popup = document.getElementById('oasa-arrivals-popup');
        if (!popup) {
            clearInterval(oasaRefreshTimer);
            oasaRefreshTimer = null;
            return;
        }
        if (oasaCurrentStop) {
            fetchAndShowArrivals(oasaCurrentStop);
        }
    }, 20000);
}

function makePopupDraggable(popup, handles) {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    function ensureLeftTopPositioning() {
        const rect = popup.getBoundingClientRect();
        const computed = window.getComputedStyle(popup);
        const hasRight = computed.right !== 'auto' && computed.right !== '';
        if (hasRight) {
            popup.style.left = rect.left + 'px';
            popup.style.top = rect.top + 'px';
            popup.style.right = 'auto';
        }
    }

    function onPointerDown(clientX, clientY) {
        ensureLeftTopPositioning();
        isDragging = true;
        const rect = popup.getBoundingClientRect();
        startX = clientX;
        startY = clientY;
        startLeft = rect.left;
        startTop = rect.top;
        document.body.style.userSelect = 'none';
    }

    function onPointerMove(clientX, clientY) {
        if (!isDragging) return;
        const dx = clientX - startX;
        const dy = clientY - startY;
        const newLeft = startLeft + dx;
        const newTop = startTop + dy;
        const rect = popup.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        const maxLeft = Math.max(0, window.innerWidth - width);
        const maxTop = Math.max(0, window.innerHeight - height);
        popup.style.left = Math.min(Math.max(0, newLeft), maxLeft) + 'px';
        popup.style.top = Math.min(Math.max(0, newTop), maxTop) + 'px';
    }

    function onPointerUp() {
        if (!isDragging) return;
        isDragging = false;
        document.body.style.userSelect = '';
    }

    handles.forEach((h) => {
        h.addEventListener('mousedown', (e) => {
            onPointerDown(e.clientX, e.clientY);
        });
        h.addEventListener('touchstart', (e) => {
            const t = e.touches && e.touches[0];
            if (!t) return;
            onPointerDown(t.clientX, t.clientY);
        }, { passive: true });
    });

    window.addEventListener('mousemove', (e) => {
        onPointerMove(e.clientX, e.clientY);
    });
    window.addEventListener('touchmove', (e) => {
        const t = e.touches && e.touches[0];
        if (!t) return;
        onPointerMove(t.clientX, t.clientY);
    }, { passive: true });
    window.addEventListener('mouseup', onPointerUp);
    window.addEventListener('touchend', onPointerUp);
}

function applyScrollableBehavior(content) {
    const fade = content.querySelector('#oasa-popup-fade');
    const children = Array.from(content.children).filter(el => el.id !== 'oasa-popup-fade');
    if (!children.length) {
        content.style.overflowY = 'visible';
        content.style.maxHeight = '';
        if (fade) fade.style.display = 'none';
        return;
    }
    if (children.length > 4) {
        const firstRow = children[0];
        const rowHeight = firstRow.getBoundingClientRect().height || 32;
        const maxH = Math.round(rowHeight * 3.5);
        content.style.overflowY = 'auto';
        content.style.maxHeight = maxH + 'px';
        if (fade) {
            fade.style.height = Math.round(rowHeight * 0.6) + 'px';
            const updateFade = () => {
                const atBottom = Math.ceil(content.scrollTop + content.clientHeight) >= content.scrollHeight;
                fade.style.display = atBottom ? 'none' : 'block';
            };
            updateFade();
            content.removeEventListener('scroll', content.__oasaFadeListener);
            content.__oasaFadeListener = () => updateFade();
            content.addEventListener('scroll', content.__oasaFadeListener);
        }
    } else {
        content.style.overflowY = 'visible';
        content.style.maxHeight = '';
        if (fade) fade.style.display = 'none';
        if (content.__oasaFadeListener) {
            content.removeEventListener('scroll', content.__oasaFadeListener);
            content.__oasaFadeListener = null;
        }
    }
}

function ensureMinimalScrollbarStyles() {
    if (document.getElementById('oasa-popup-scrollbar-style')) return;
    const style = document.createElement('style');
    style.id = 'oasa-popup-scrollbar-style';
    style.textContent = `
        /* Firefox */
        #oasa-popup-content { scrollbar-width: thin; scrollbar-color: #1a4bd6 transparent; }
        /* WebKit */
        #oasa-popup-content::-webkit-scrollbar { width: 6px; }
        #oasa-popup-content::-webkit-scrollbar-track { background: transparent; }
        #oasa-popup-content::-webkit-scrollbar-thumb { background-color: #1a4bd6; border-radius: 6px; }
        #oasa-popup-content::-webkit-scrollbar-thumb:hover { background-color: #2a5cf0; }
    `;
    document.head.appendChild(style);
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
    oasaCurrentStop = stopcode;
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

// Continuously monitor DOM for the stop code span appearing/updates
function startObservingStopCode() {
    if (oasaStopObserverStarted) return;
    oasaStopObserverStarted = true;
    const observerCallback = () => {
        if (oasaStopDebounceTimer) {
            clearTimeout(oasaStopDebounceTimer);
        }
        oasaStopDebounceTimer = setTimeout(() => {
            const stopcode = findStopCodeInPanel();
            const popup = document.getElementById('oasa-arrivals-popup');
            if (stopcode && stopcode !== oasaCurrentStop) {
                fetchAndShowArrivals(stopcode);
            } else if (stopcode && !popup) {
                // If popup was closed but stop is visible, show it
                fetchAndShowArrivals(stopcode);
            }
        }, 300);
    };
    oasaStopObserver = new MutationObserver(observerCallback);
    try {
        oasaStopObserver.observe(document.body, { subtree: true, childList: true, characterData: true });
    } catch (e) {
        // Some pages may restrict observing; ignore
    }
}

startObservingStopCode();

