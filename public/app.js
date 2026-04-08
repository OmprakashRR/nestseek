// === Config ===
const API = '/api';

// === State ===
let currentUser = null;
let authToken = localStorage.getItem('nestseek_token');
let rentalType = 'temporary';
let propType = 'temporary';
let areaChips = [];

// === Init ===
document.addEventListener('DOMContentLoaded', () => {
    setMinDates();
    loadStats();

    if (authToken) {
        fetchProfile();
    }

    // Check for verification redirect
    if (window.location.search.includes('verified=true')) {
        showToast('Email verified successfully!');
        history.replaceState(null, '', '/');
    }
});

// === API Helper ===
async function api(endpoint, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) {
        headers['Authorization'] = 'Bearer ' + authToken;
    }

    const res = await fetch(API + endpoint, {
        ...options,
        headers: { ...headers, ...options.headers }
    });

    const data = await res.json();

    if (!res.ok) {
        throw new Error(data.error || 'Request failed');
    }

    return data;
}

// === Auth ===
function showAuthTab(tab) {
    document.getElementById('login-form').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('register-form').style.display = tab === 'register' ? 'block' : 'none';
    document.getElementById('tab-login').classList.toggle('active', tab === 'login');
    document.getElementById('tab-register').classList.toggle('active', tab === 'register');
}

async function handleLogin(e) {
    e.preventDefault();
    try {
        const data = await api('/auth/login', {
            method: 'POST',
            body: JSON.stringify({
                email: document.getElementById('login-email').value,
                password: document.getElementById('login-password').value
            })
        });
        setAuth(data.token, data.user);
        showToast('Welcome back, ' + data.user.name + '!');
        showPage('home');
    } catch (err) {
        showToast(err.message);
    }
}

async function handleRegister(e) {
    e.preventDefault();
    try {
        const data = await api('/auth/register', {
            method: 'POST',
            body: JSON.stringify({
                name: document.getElementById('reg-name').value,
                email: document.getElementById('reg-email').value,
                password: document.getElementById('reg-password').value,
                phone: document.getElementById('reg-phone').value,
                occupation: document.getElementById('reg-occupation').value,
                about: document.getElementById('reg-about').value
            })
        });
        setAuth(data.token, data.user);
        showToast('Account created! Check your email to verify.');
        showPage('home');
    } catch (err) {
        showToast(err.message);
    }
}

function setAuth(token, user) {
    authToken = token;
    currentUser = user;
    localStorage.setItem('nestseek_token', token);
    updateNav();
}

function logout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('nestseek_token');
    updateNav();
    showPage('home');
    showToast('Logged out.');
}

async function fetchProfile() {
    try {
        const data = await api('/auth/me');
        currentUser = data.user;
        updateNav();
        loadNotificationCount();
    } catch (err) {
        logout();
    }
}

function updateNav() {
    const loggedIn = !!currentUser;
    document.getElementById('nav-login').style.display = loggedIn ? 'none' : 'inline';
    document.getElementById('nav-logout').style.display = loggedIn ? 'inline' : 'none';
    document.getElementById('nav-dashboard').style.display = loggedIn ? 'inline' : 'none';
    document.getElementById('nav-notifications').style.display = loggedIn ? 'inline' : 'none';
}

function requireAuth() {
    if (!currentUser) {
        showToast('Please login or register first.');
        showPage('login');
        return false;
    }
    return true;
}

// === Navigation ===
function showPage(pageId) {
    if (['post-need', 'list-property', 'dashboard', 'notifications'].includes(pageId)) {
        if (!requireAuth()) return;
    }

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + pageId).classList.add('active');
    window.scrollTo(0, 0);

    if (pageId === 'browse-needs') loadNeeds();
    if (pageId === 'dashboard') loadDashboard();
    if (pageId === 'notifications') loadNotifications();

    document.querySelector('.nav-links').classList.remove('open');
}

function toggleMenu() {
    document.querySelector('.nav-links').classList.toggle('open');
}

// === Stats ===
async function loadStats() {
    try {
        const data = await api('/stats');
        document.getElementById('stat-needs').textContent = data.active_needs;
        document.getElementById('stat-matches').textContent = data.total_matches;
        document.getElementById('stat-properties').textContent = data.active_properties;
    } catch (err) {
        // Server not running - show zeros
    }
}

// === Rental Type Toggle ===
function setRentalType(type, btn) {
    rentalType = type;
    document.querySelectorAll('#need-form .toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('date-fields').style.display = type === 'temporary' ? 'block' : 'none';
    document.getElementById('permanent-date-field').style.display = type === 'permanent' ? 'block' : 'none';
}

function setPropType(type, btn) {
    propType = type;
    document.getElementById('prop-type-temp').classList.toggle('active', type === 'temporary');
    document.getElementById('prop-type-perm').classList.toggle('active', type === 'permanent');
    document.getElementById('rtb-section').style.display = type === 'permanent' ? 'block' : 'none';
}

function toggleRtbNumber() {
    document.getElementById('rtb-number-group').style.display =
        document.getElementById('prop-rtb').checked ? 'block' : 'none';
}

// === Chip Input ===
function addChip(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        const input = event.target;
        const value = input.value.trim();
        if (value && !areaChips.includes(value)) {
            areaChips.push(value);
            renderChips();
        }
        input.value = '';
    }
}

function renderChips() {
    const container = document.getElementById('area-chips');
    const input = document.getElementById('area-input');
    container.querySelectorAll('.chip').forEach(c => c.remove());
    areaChips.forEach((area, i) => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.innerHTML = `${escapeHtml(area)} <span class="chip-remove" onclick="removeChip(${i})">&times;</span>`;
        container.insertBefore(chip, input);
    });
}

function removeChip(index) {
    areaChips.splice(index, 1);
    renderChips();
}

// === Set Min Dates ===
function setMinDates() {
    const today = new Date().toISOString().split('T')[0];
    document.querySelectorAll('input[type="date"]').forEach(input => input.setAttribute('min', today));
}

// === Submit Need ===
async function submitNeed(e) {
    e.preventDefault();
    if (!requireAuth()) return;

    if (areaChips.length === 0) {
        showToast('Please add at least one preferred area');
        return;
    }

    const budgetMin = parseInt(document.getElementById('budget-min').value);
    const budgetMax = parseInt(document.getElementById('budget-max').value);
    if (budgetMax < budgetMin) {
        showToast('Maximum budget must be higher than minimum');
        return;
    }

    const payload = {
        type: rentalType,
        areas: [...areaChips],
        budget_min: budgetMin,
        budget_max: budgetMax,
        room_type: document.getElementById('room-type').value,
        preferences: getPreferences(),
        about: document.getElementById('need-about').value
    };

    if (rentalType === 'temporary') {
        payload.move_in = document.getElementById('move-in').value;
        payload.move_out = document.getElementById('move-out').value;
    } else {
        payload.move_in = document.getElementById('perm-move-in').value;
    }

    try {
        const data = await api('/needs', { method: 'POST', body: JSON.stringify(payload) });

        document.getElementById('need-form').reset();
        areaChips = [];
        renderChips();
        rentalType = 'temporary';
        document.querySelectorAll('#need-form .toggle-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
        document.getElementById('date-fields').style.display = 'block';
        document.getElementById('permanent-date-field').style.display = 'none';

        let msg = 'Your need has been posted!';
        if (data.matches && data.matches.length > 0) {
            msg += ` We found ${data.matches.length} matching properties!`;
        }
        showToast(msg);
        showPage('dashboard');
    } catch (err) {
        showToast(err.message);
    }
}

function getPreferences() {
    const prefs = [];
    if (document.getElementById('pref-furnished').checked) prefs.push('Furnished');
    if (document.getElementById('pref-bills').checked) prefs.push('Bills Included');
    if (document.getElementById('pref-parking').checked) prefs.push('Parking');
    if (document.getElementById('pref-pets').checked) prefs.push('Pet Friendly');
    if (document.getElementById('pref-wifi').checked) prefs.push('WiFi');
    if (document.getElementById('pref-transport').checked) prefs.push('Near Transport');
    return prefs;
}

// === Submit Property ===
async function submitProperty(e) {
    e.preventDefault();
    if (!requireAuth()) return;

    const payload = {
        title: document.getElementById('prop-title').value,
        address: document.getElementById('prop-address').value,
        area: document.getElementById('prop-area').value,
        room_type: document.getElementById('prop-room-type').value,
        rent_monthly: parseInt(document.getElementById('prop-rent').value),
        deposit_amount: 0,
        available_from: document.getElementById('prop-from').value,
        available_to: document.getElementById('prop-to').value || null,
        type: propType,
        description: document.getElementById('prop-description').value,
        furnished: document.getElementById('prop-furnished').checked,
        bills_included: document.getElementById('prop-bills').checked,
        wifi: document.getElementById('prop-wifi').checked,
        parking: document.getElementById('prop-parking').checked,
        pet_friendly: document.getElementById('prop-pets').checked,
        near_transport: document.getElementById('prop-transport').checked,
        rtb_registered: document.getElementById('prop-rtb') ? document.getElementById('prop-rtb').checked : false,
        rtb_number: document.getElementById('prop-rtb-number') ? document.getElementById('prop-rtb-number').value : null
    };

    try {
        await api('/properties', { method: 'POST', body: JSON.stringify(payload) });
        document.getElementById('property-form').reset();
        propType = 'temporary';
        document.getElementById('prop-type-temp').classList.add('active');
        document.getElementById('prop-type-perm').classList.remove('active');
        document.getElementById('rtb-section').style.display = 'none';
        showToast('Property listed! Matching tenants will be notified.');
        showPage('dashboard');
    } catch (err) {
        showToast(err.message);
    }
}

// === Load & Browse Needs ===
let loadNeedsDebounce;
function debounceLoadNeeds() {
    clearTimeout(loadNeedsDebounce);
    loadNeedsDebounce = setTimeout(loadNeeds, 400);
}

async function loadNeeds() {
    try {
        const params = new URLSearchParams();
        const type = document.getElementById('filter-type').value;
        const room = document.getElementById('filter-room').value;
        const area = document.getElementById('filter-area').value;
        const budget = document.getElementById('filter-budget').value;

        if (type !== 'all') params.set('type', type);
        if (room !== 'all') params.set('room_type', room);
        if (area) params.set('area', area);
        if (budget) params.set('max_budget', budget);

        const data = await api('/needs?' + params.toString());
        const container = document.getElementById('needs-list');
        const noNeeds = document.getElementById('no-needs');

        if (data.needs.length === 0) {
            container.innerHTML = '';
            noNeeds.style.display = 'block';
            return;
        }

        noNeeds.style.display = 'none';
        container.innerHTML = data.needs.map(need => createNeedCard(need, false)).join('');
    } catch (err) {
        console.error('Failed to load needs:', err);
    }
}

// === Dashboard ===
async function loadDashboard() {
    if (!currentUser) return;

    // Load my needs
    try {
        const data = await api('/needs/user/mine');
        const container = document.getElementById('my-needs-list');
        const empty = document.getElementById('no-my-needs');

        if (data.needs.length === 0) {
            container.innerHTML = '';
            empty.style.display = 'block';
        } else {
            empty.style.display = 'none';
            container.innerHTML = data.needs.map(n => createNeedCard(n, true)).join('');
        }
    } catch (err) {
        console.error('Failed to load my needs:', err);
    }

    // Load my properties
    try {
        const data = await api('/properties/user/mine');
        const container = document.getElementById('my-properties-list');
        const empty = document.getElementById('no-my-properties');

        if (data.properties.length === 0) {
            container.innerHTML = '';
            empty.style.display = 'block';
        } else {
            empty.style.display = 'none';
            container.innerHTML = data.properties.map(p => createPropertyCard(p)).join('');
        }
    } catch (err) {
        console.error('Failed to load my properties:', err);
    }

    // Load my offers sent
    try {
        const data = await api('/offers/mine');
        const container = document.getElementById('my-offers-list');
        const empty = document.getElementById('no-my-offers');

        if (data.offers.length === 0) {
            container.innerHTML = '';
            empty.style.display = 'block';
        } else {
            empty.style.display = 'none';
            container.innerHTML = data.offers.map(o => createOfferSentCard(o)).join('');
        }
    } catch (err) {
        console.error('Failed to load my offers:', err);
    }
}

// === Notifications ===
async function loadNotificationCount() {
    if (!currentUser) return;
    try {
        const data = await api('/notifications?unread_only=true');
        const badge = document.getElementById('notif-badge');
        if (data.unread_count > 0) {
            badge.textContent = data.unread_count;
            badge.style.display = 'inline';
        } else {
            badge.style.display = 'none';
        }
    } catch (err) { /* ignore */ }
}

async function loadNotifications() {
    try {
        const data = await api('/notifications');
        const container = document.getElementById('notifications-list');
        const empty = document.getElementById('no-notifications');

        if (data.notifications.length === 0) {
            container.innerHTML = '';
            empty.style.display = 'block';
            return;
        }

        empty.style.display = 'none';
        container.innerHTML = data.notifications.map(n => `
            <div class="notification-item ${n.read ? '' : 'unread'}" onclick="markNotifRead('${n.id}', this)">
                <div class="notif-title">${escapeHtml(n.title)}</div>
                <div class="notif-message">${escapeHtml(n.message)}</div>
                <div class="notif-time">${timeAgo(n.created_at)}</div>
            </div>
        `).join('');
    } catch (err) {
        console.error('Failed to load notifications:', err);
    }
}

async function markNotifRead(id, el) {
    try {
        await api('/notifications/' + id + '/read', { method: 'PATCH' });
        el.classList.remove('unread');
        loadNotificationCount();
    } catch (err) { /* ignore */ }
}

async function markAllRead() {
    try {
        await api('/notifications/read-all', { method: 'POST' });
        document.querySelectorAll('.notification-item.unread').forEach(el => el.classList.remove('unread'));
        document.getElementById('notif-badge').style.display = 'none';
        showToast('All notifications marked as read.');
    } catch (err) {
        showToast(err.message);
    }
}

// === Offer Modal ===
function openOfferModal(needId, needName) {
    if (!requireAuth()) return;
    document.getElementById('offer-need-id').value = needId;
    document.getElementById('offer-to-name').textContent = 'Offering to: ' + needName;
    document.getElementById('offer-modal').style.display = 'flex';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

async function submitOffer(e) {
    e.preventDefault();

    const payload = {
        need_id: document.getElementById('offer-need-id').value,
        rent_proposed: parseInt(document.getElementById('offer-rent').value),
        message: document.getElementById('offer-message').value
    };

    try {
        await api('/offers', { method: 'POST', body: JSON.stringify(payload) });
        closeModal('offer-modal');
        document.getElementById('offer-rent').value = '';
        document.getElementById('offer-message').value = '';
        showToast('Offer sent! The tenant will be notified.');
    } catch (err) {
        showToast(err.message);
    }
}

// === Accept / Decline Offers ===
async function acceptOffer(offerId) {
    try {
        await api('/offers/' + offerId + '/accept', { method: 'POST' });
        showToast('Offer accepted! You can now contact each other directly.');
        loadDashboard();
    } catch (err) {
        showToast(err.message);
    }
}

async function declineOffer(offerId) {
    try {
        await api('/offers/' + offerId + '/decline', { method: 'POST' });
        showToast('Offer declined.');
        loadDashboard();
    } catch (err) {
        showToast(err.message);
    }
}

// === Delete Need / Property ===
async function deleteNeed(needId) {
    try {
        await api('/needs/' + needId, { method: 'DELETE' });
        showToast('Need removed.');
        loadDashboard();
    } catch (err) {
        showToast(err.message);
    }
}

async function deleteProperty(propId) {
    try {
        await api('/properties/' + propId, { method: 'DELETE' });
        showToast('Property removed.');
        loadDashboard();
    } catch (err) {
        showToast(err.message);
    }
}

// === Withdraw Offer ===
async function withdrawOffer(offerId) {
    try {
        await api('/offers/' + offerId + '/withdraw', { method: 'POST' });
        showToast('Offer withdrawn.');
        loadDashboard();
    } catch (err) {
        showToast(err.message);
    }
}

// === Card Renderers ===
const ROOM_LABELS = {
    'single-room': 'Single Room', 'double-room': 'Double Room', 'shared-room': 'Shared Room',
    'studio': 'Studio', '1bed-apartment': '1 Bed Apt', '2bed-apartment': '2 Bed Apt', 'house': 'House'
};

function createNeedCard(need, isOwner) {
    const dates = need.type === 'temporary' && need.move_out
        ? `${formatDate(need.move_in)} - ${formatDate(need.move_out)}`
        : `From ${formatDate(need.move_in)}`;

    const areasHtml = (need.areas || []).map(a => `<span class="area-tag">${escapeHtml(a)}</span>`).join('');
    const prefsHtml = (need.preferences || []).map(p => `<span class="pref-tag">${p}</span>`).join('');

    const userName = need.name || (currentUser ? currentUser.name : '');
    const occupation = need.occupation || '';

    // Offers section for owner's own needs
    let offersHtml = '';
    if (isOwner && need.offers && need.offers.length > 0) {
        offersHtml = `
            <div class="offers-section">
                <h4>Offers Received (${need.offers.length})</h4>
                ${need.offers.map(o => `
                    <div class="offer-item">
                        <div class="offer-item-header">
                            <span class="offer-item-name">${escapeHtml(o.offerer_name)}</span>
                            <span class="offer-item-rent">&euro;${o.rent_proposed}/mo</span>
                        </div>
                        ${o.property_area ? `<div class="offer-item-detail">Property in ${escapeHtml(o.property_area)}</div>` : ''}
                        ${o.message ? `<div class="offer-item-detail">${escapeHtml(o.message)}</div>` : ''}
                        <div class="offer-item-detail">Contact: ${escapeHtml(o.offerer_email)}</div>
                        ${o.status === 'pending' ? `
                            <div style="margin-top:8px; display:flex; gap:8px;">
                                <button class="btn btn-accent btn-sm" onclick="acceptOffer('${o.id}')">Accept</button>
                                <button class="btn btn-outline btn-sm" onclick="declineOffer('${o.id}')">Decline</button>
                            </div>
                        ` : `<div class="offer-item-detail" style="margin-top:4px;"><strong>Status:</strong> ${o.status}</div>`}
                    </div>
                `).join('')}
            </div>`;
    }

    const statusBadge = need.status && need.status !== 'active'
        ? `<span class="need-card-type" style="background:#e0e0e0;color:#333;">${need.status}</span>` : '';

    const actionBtn = isOwner
        ? `<button class="btn btn-outline btn-sm" onclick="deleteNeed('${need.id}')">Remove</button>`
        : `<button class="btn btn-primary btn-sm" onclick="openOfferModal('${need.id}', '${escapeHtml(userName).replace(/'/g, "\\'")}')">Make an Offer</button>`;

    const verifiedBadge = need.verified ? '<span class="verified-badge">&#10003; Verified</span>' : '';

    return `
        <div class="need-card">
            <div class="need-card-header">
                <div>
                    <div class="need-card-name">${escapeHtml(userName)} ${verifiedBadge}</div>
                    <div class="need-card-occupation">${escapeHtml(occupation)}</div>
                </div>
                <div>
                    <span class="need-card-type type-${need.type}">
                        ${need.type === 'temporary' ? 'Temporary' : 'Permanent'}
                    </span>
                    ${statusBadge}
                </div>
            </div>
            <div class="need-card-details">
                <div class="need-detail">
                    <span class="need-detail-label">Budget</span>
                    <span class="need-detail-value">&euro;${need.budget_min} - &euro;${need.budget_max}/mo</span>
                </div>
                <div class="need-detail">
                    <span class="need-detail-label">Room Type</span>
                    <span class="need-detail-value">${ROOM_LABELS[need.room_type] || need.room_type}</span>
                </div>
                <div class="need-detail">
                    <span class="need-detail-label">Dates</span>
                    <span class="need-detail-value">${dates}</span>
                </div>
            </div>
            <div class="need-card-areas">${areasHtml}</div>
            ${prefsHtml ? `<div class="need-card-prefs">${prefsHtml}</div>` : ''}
            ${need.about ? `<div class="need-card-about">${escapeHtml(need.about)}</div>` : ''}
            ${need.user_about && !isOwner ? `<div class="need-card-about">${escapeHtml(need.user_about)}</div>` : ''}
            <div class="need-card-footer">${actionBtn}</div>
            <div class="need-card-date">Posted ${timeAgo(need.created_at)}</div>
            ${offersHtml}
        </div>`;
}

function createPropertyCard(prop) {
    const amenities = [];
    if (prop.furnished) amenities.push('Furnished');
    if (prop.bills_included) amenities.push('Bills Incl.');
    if (prop.wifi) amenities.push('WiFi');
    if (prop.parking) amenities.push('Parking');
    if (prop.pet_friendly) amenities.push('Pets OK');
    if (prop.near_transport) amenities.push('Near Transport');

    const dates = prop.available_to
        ? `${formatDate(prop.available_from)} - ${formatDate(prop.available_to)}`
        : `From ${formatDate(prop.available_from)}`;

    return `
        <div class="need-card">
            <div class="need-card-header">
                <div>
                    <div class="need-card-name">${escapeHtml(prop.title)}</div>
                    <div class="need-card-occupation">${escapeHtml(prop.area)}</div>
                </div>
                <span class="need-card-type type-${prop.type}">
                    ${prop.type === 'temporary' ? 'Temporary' : 'Permanent'}
                </span>
            </div>
            <div class="need-card-details">
                <div class="need-detail">
                    <span class="need-detail-label">Rent</span>
                    <span class="need-detail-value">&euro;${prop.rent_monthly}/mo</span>
                </div>
                <div class="need-detail">
                    <span class="need-detail-label">Room Type</span>
                    <span class="need-detail-value">${ROOM_LABELS[prop.room_type] || prop.room_type}</span>
                </div>
                <div class="need-detail">
                    <span class="need-detail-label">Available</span>
                    <span class="need-detail-value">${dates}</span>
                </div>
            </div>
            ${amenities.length ? `<div class="need-card-prefs">${amenities.map(a => `<span class="pref-tag">${a}</span>`).join('')}</div>` : ''}
            ${prop.rtb_registered ? '<div class="rtb-badge">RTB Registered</div>' : ''}
            ${prop.description ? `<div class="need-card-about">${escapeHtml(prop.description)}</div>` : ''}
            <div class="need-card-footer">
                <span class="need-card-type" style="background:${prop.status === 'active' ? '#e8f5e9' : '#fff3e0'};color:${prop.status === 'active' ? '#2e7d32' : '#e65100'};">
                    ${prop.status}
                </span>
                <button class="btn btn-outline btn-sm" onclick="deleteProperty('${prop.id}')">Remove</button>
            </div>
            <div class="need-card-date">Listed ${timeAgo(prop.created_at)}</div>
        </div>`;
}

function createOfferSentCard(o) {
    const statusColors = {
        pending: { bg: '#fff3e0', color: '#e65100' },
        accepted: { bg: '#e8f5e9', color: '#2e7d32' },
        declined: { bg: '#fce4ec', color: '#c62828' },
        withdrawn: { bg: '#f5f5f5', color: '#666' }
    };
    const sc = statusColors[o.status] || statusColors.pending;

    return `
        <div class="need-card">
            <div class="need-card-header">
                <div>
                    <div class="need-card-name">Offer to ${escapeHtml(o.tenant_name)}</div>
                    <div class="need-card-occupation">${ROOM_LABELS[o.need_room_type] || o.need_room_type} &middot; ${o.need_type}</div>
                </div>
                <span class="need-card-type" style="background:${sc.bg};color:${sc.color};">${o.status}</span>
            </div>
            <div class="need-card-details">
                <div class="need-detail">
                    <span class="need-detail-label">Your Offer</span>
                    <span class="need-detail-value">&euro;${o.rent_proposed}/mo</span>
                </div>
                <div class="need-detail">
                    <span class="need-detail-label">Their Budget</span>
                    <span class="need-detail-value">&euro;${o.budget_min} - &euro;${o.budget_max}/mo</span>
                </div>
            </div>
            <div class="need-card-footer">
                ${o.status === 'pending' ? `<button class="btn btn-outline btn-sm" onclick="withdrawOffer('${o.id}')">Withdraw</button>` : ''}
            </div>
            <div class="need-card-date">Sent ${timeAgo(o.created_at)}</div>
        </div>`;
}

// === Toast ===
function showToast(message) {
    const toast = document.getElementById('toast');
    document.getElementById('toast-message').textContent = message;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 4000);
}

// === Helpers ===
function formatDate(dateStr) {
    if (!dateStr) return 'Flexible';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function timeAgo(dateStr) {
    if (!dateStr) return '';
    const now = new Date();
    const date = new Date(dateStr);
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
    return formatDate(dateStr);
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Poll notifications every 60s
setInterval(() => {
    if (currentUser) loadNotificationCount();
}, 60000);
