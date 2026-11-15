
import React, { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { api, getToken } from './api';

const initials = n =>
  (n || '?').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase();

const list = v =>
  Array.isArray(v) ? v : String(v || '').split(',').map(x => x.trim()).filter(Boolean);

const getId = value => {
  if (!value) return '';
  return String(value._id || value.id || value);
};

export default function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(getToken());
  const [page, setPage] = useState('dashboard');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: ''
  });

  const [mode, setMode] = useState('login');
  const [people, setPeople] = useState([]);
  const [requests, setRequests] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const [profile, setProfile] = useState({
    name: '',
    bio: '',
    location: '',
    skillsOffered: '',
    skillsWanted: ''
  });

  const [review, setReview] = useState({
    rating: 5,
    comment: ''
  });

  const [schedule, setSchedule] = useState({
    guest: '',
    title: 'Skill exchange session',
    startsAt: '',
    notes: ''
  });

  const [dark, setDark] = useState(
    localStorage.getItem('skillswap_dark') === '1'
  );

  const flash = t => {
    setNotice(t);
    setTimeout(() => setNotice(''), 3000);
  };

  async function load() {
    try {
      const [p, r, n, s] = await Promise.all([
        api('/users'),
        api('/requests/mine'),
        api('/extra/notifications'),
        api('/extra/sessions')
      ]);

      setPeople(p.users || []);
      setRequests(r.requests || []);
      setNotifications(n.notifications || []);
      setSessions(s.sessions || []);

      const me = await api('/auth/me');

      setUser(me.user);

      setProfile({
        ...me.user,
        skillsOffered: (me.user.skillsOffered || []).join(', '),
        skillsWanted: (me.user.skillsWanted || []).join(', ')
      });
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    if (token) load();
  }, [token]);

  useEffect(() => {
    if (!token) return;

    const socket = io(
      import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000',
      { auth: { token } }
    );

    socket.on('private_message', m => {
      if (
        selected &&
        getId(selected) === getId(m.from)
      ) {
        setMessages(old => [...old, { ...m, _id: Date.now() }]);
      }

      flash('New chat message received');
    });

    return () => socket.disconnect();
  }, [token, selected]);

  async function auth(e) {
    e.preventDefault();
    setBusy(true);
    setError('');

    try {
      const d = await api(`/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify(form)
      });

      localStorage.setItem('skillswap_token', d.token);
      setToken(d.token);
      setUser(d.user);
      flash('Welcome to SkillSwap!');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    localStorage.removeItem('skillswap_token');
    setToken('');
    setUser(null);
    setSelected(null);
    setMessages([]);
    setPage('dashboard');
  }

  async function discover() {
    try {
      const d = await api(`/users?search=${encodeURIComponent(query)}`);
      setPeople(d.users || []);
    } catch (e) {
      setError(e.message);
    }
  }

  async function saveProfile(e) {
    e.preventDefault();

    try {
      const d = await api('/users/me', {
        method: 'PUT',
        body: JSON.stringify({
          ...profile,
          skillsOffered: list(profile.skillsOffered),
          skillsWanted: list(profile.skillsWanted)
        })
      });

      setUser(d.user);
      flash('Profile updated');
    } catch (e) {
      setError(e.message);
    }
  }

  async function sendRequest(person) {
    const offered = list(user.skillsOffered)[0] || 'My skill';
    const wanted = list(person.skillsOffered)[0] || 'Your skill';

    try {
      await api('/requests', {
        method: 'POST',
        body: JSON.stringify({
          to: person._id,
          skillOffered: offered,
          skillWanted: wanted,
          message: `I would like to exchange ${offered} for ${wanted}.`
        })
      });

      flash('Skill exchange request sent');

      const d = await api('/requests/mine');
      setRequests(d.requests || []);
    } catch (e) {
      setError(e.message);
    }
  }

  async function changeRequest(id, status) {
    try {
      setError('');

      await api(`/requests/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });

      const d = await api('/requests/mine');
      setRequests(d.requests || []);

      flash(
        status === 'accepted'
          ? 'Skill exchange request accepted!'
          : 'Skill exchange request declined!'
      );
    } catch (e) {
      setError(e.message);
    }
  }

  // Open a conversation with the selected person.
  async function openChat(person) {
    if (!person || !person._id) {
      setError('Unable to open chat: user ID is missing.');
      return;
    }

    setError('');
    setMessages([]);
    setSelected(person);
    setPage('chat');
    setChatLoading(true);

    try {
      const d = await api(`/extra/messages/${person._id}`);

      setMessages(Array.isArray(d.messages) ? d.messages : []);
    } catch (e) {
      setError(`Could not load messages: ${e.message}`);
    } finally {
      setChatLoading(false);
    }
  }

  async function sendMessage(e) {
    e.preventDefault();

    if (!message.trim() || !selected) return;

    try {
      const d = await api(`/extra/messages/${selected._id}`, {
        method: 'POST',
        body: JSON.stringify({ text: message.trim() })
      });

      if (d.message) {
        setMessages(old => [...old, d.message]);
      }

      setMessage('');
    } catch (e) {
      setError(e.message);
    }
  }

  async function submitReview(person) {
    try {
      await api('/extra/reviews', {
        method: 'POST',
        body: JSON.stringify({
          reviewee: person._id,
          ...review
        })
      });

      flash('Review submitted');
      setReview({ rating: 5, comment: '' });
    } catch (e) {
      setError(e.message);
    }
  }

  async function createSession(e) {
    e.preventDefault();

    try {
      await api('/extra/sessions', {
        method: 'POST',
        body: JSON.stringify(schedule)
      });

      const d = await api('/extra/sessions');
      setSessions(d.sessions || []);
      flash('Session scheduled');
    } catch (e) {
      setError(e.message);
    }
  }

  async function markNotifications() {
    try {
      await api('/extra/notifications/read', {
        method: 'PATCH'
      });

      setNotifications(old =>
        old.map(n => ({ ...n, read: true }))
      );
    } catch (e) {
      setError(e.message);
    }
  }

  const matches = useMemo(() => {
    return people.map(p => {
      const a = list(user?.skillsOffered).map(x => x.toLowerCase());
      const b = list(user?.skillsWanted).map(x => x.toLowerCase());
      const offers = list(p.skillsOffered).map(x => x.toLowerCase());
      const wants = list(p.skillsWanted).map(x => x.toLowerCase());

      const score =
        offers.filter(x => b.includes(x)).length +
        wants.filter(x => a.includes(x)).length;

      return {
        ...p,
        match: Math.min(100, score * 50)
      };
    }).sort((a, b) => b.match - a.match);
  }, [people, user]);

  const nav = [
    ['dashboard', 'Overview'],
    ['discover', 'Discover'],
    ['requests', 'Requests'],
    ['chat', 'Messages'],
    ['sessions', 'Sessions'],
    ['progress', 'My progress'],
    ['leaderboard', 'Community'],
    ['profile', 'My profile'],
    ['notifications', 'Notifications']
  ];

  if (!token) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="brand-mark">S</div>
          <p className="eyebrow">LEARN · SHARE · GROW</p>

          <h1>
            {mode === 'login' ? 'Welcome back' : 'Join SkillSwap'}
          </h1>

          <p className="muted">
            Exchange knowledge with a community that grows together.
          </p>

          <form onSubmit={auth}>
            {mode === 'register' && (
              <input
                placeholder="Full name"
                required
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
            )}

            <input
              type="email"
              placeholder="Email address"
              required
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
            />

            <input
              type="password"
              placeholder="Password (min. 6 characters)"
              minLength="6"
              required
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
            />

            <button className="primary full" disabled={busy}>
              {busy
                ? 'Please wait…'
                : mode === 'login'
                  ? 'Sign in'
                  : 'Create account'}
            </button>
          </form>

          {error && <p className="error">{error}</p>}

          <p className="switch">
            {mode === 'login'
              ? 'New to SkillSwap?'
              : 'Already have an account?'}

            {' '}

            <button
              className="link"
              onClick={() =>
                setMode(mode === 'login' ? 'register' : 'login')
              }
            >
              {mode === 'login' ? 'Create account' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    );
  }

  const title = nav.find(x => x[0] === page)?.[1] || 'SkillSwap';

  return (
    <div className={dark ? 'app dark' : 'app'}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">S</span>
          <span>
            SkillSwap
            <small>COMMUNITY</small>
          </span>
        </div>

        <div className="side-label">WORKSPACE</div>

        {nav.map(([id, label]) => (
          <button
            key={id}
            className={`nav-item ${page === id ? 'active' : ''}`}
            onClick={() => setPage(id)}
          >
            <span>
              {{
                dashboard: '⌂',
                discover: '⌕',
                requests: '⇄',
                chat: '◌',
                sessions: '▦',
                progress: '◔',
                leaderboard: '♜',
                profile: '◎',
                notifications: '♧'
              }[id]}
            </span>

            {label}

            {id === 'notifications' &&
              notifications.some(n => !n.read) && <i className="dot" />}
          </button>
        ))}

        <div className="side-bottom">
          <button
            className="nav-item"
            onClick={() => {
              const v = !dark;
              setDark(v);
              localStorage.setItem('skillswap_dark', v ? '1' : '0');
            }}
          >
            ◐ Appearance
          </button>

          <button className="nav-item" onClick={logout}>
            ↪ Sign out
          </button>

          <div className="mini-user">
            <div className="avatar">{initials(user?.name)}</div>
            <div>
              <b>{user?.name}</b>
              <small>SkillSwap member</small>
            </div>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">YOUR LEARNING SPACE</p>
            <h2>{title}</h2>
          </div>

          <div className="top-actions">
            <button
              className="icon-btn"
              onClick={() => setPage('notifications')}
            >
              ♧ <span>{notifications.filter(n => !n.read).length || ''}</span>
            </button>

            <div className="avatar">{initials(user?.name)}</div>
          </div>
        </header>

        {error && (
          <div className="alert error">
            {error}
            <button onClick={() => setError('')}>×</button>
          </div>
        )}

        {notice && <div className="alert success">{notice}</div>}

        {page === 'dashboard' && (
          <>
            <section className="hero">
              <div>
                <p className="eyebrow light">
                  A COMMUNITY OF SHARED KNOWLEDGE
                </p>

                <h1>
                  Every skill has a story.
                  <br />
                  Share yours.
                </h1>

                <p>
                  Teach what you know. Learn what you love. Build something together.
                </p>

                <button
                  className="hero-btn"
                  onClick={() => setPage('discover')}
                >
                  Find your skill match →
                </button>
              </div>

              <div className="hero-art">
                ✳<span>✦</span><b>↗</b>
              </div>
            </section>

            <div className="stats-grid">
              <Stat label="People to discover" value={people.length} />
              <Stat label="Your requests" value={requests.length} />
              <Stat
                label="Unread updates"
                value={notifications.filter(n => !n.read).length}
              />
              <Stat
                label="Upcoming sessions"
                value={sessions.filter(s => s.status === 'scheduled').length}
              />
            </div>

            <div className="section-head">
              <div>
                <p className="eyebrow">CURATED FOR YOU</p>
                <h3>Top skill matches</h3>
              </div>

              <button
                className="text-btn"
                onClick={() => setPage('discover')}
              >
                Explore all →
              </button>
            </div>

            <div className="card-grid">
              {matches.slice(0, 3).map(p => (
                <PersonCard
                  key={p._id}
                  p={p}
                  onRequest={sendRequest}
                  onChat={openChat}
                />
              ))}
            </div>
          </>
        )}

        {page === 'discover' && (
          <>
            <div className="section-head">
              <div>
                <p className="eyebrow">FIND YOUR NEXT COLLABORATOR</p>
                <h3>Discover people</h3>
                <p className="muted">
                  Matches are ranked by skills you want and skills they offer.
                </p>
              </div>
            </div>

            <div className="searchbar">
              <span>⌕</span>

              <input
                placeholder="Search people, skills or interests…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && discover()}
              />

              <button className="primary" onClick={discover}>
                Search
              </button>
            </div>

            <div className="card-grid">
              {matches.map(p => (
                <PersonCard
                  key={p._id}
                  p={p}
                  onRequest={sendRequest}
                  onChat={openChat}
                />
              ))}
            </div>
          </>
        )}

        {page === 'requests' && (
          <div className="panel">
            <h3>Skill exchange requests</h3>

            {requests.length ? (
              requests.map(r => {
                const currentUserId = getId(user);
                const receiverId = getId(r.to);
                const isIncoming = receiverId === currentUserId;

                const otherUser = isIncoming ? r.from : r.to;

                return (
                  <div className="list-row" key={r._id}>
                    <div className="avatar">
                      {initials(otherUser?.name)}
                    </div>

                    <div className="grow">
                      <b>
                        {isIncoming
                          ? `From ${otherUser?.name || 'Member'}`
                          : `To ${otherUser?.name || 'Member'}`}
                      </b>

                      <p className="muted">
                        {r.skillOffered} ↔ {r.skillWanted}
                      </p>

                      <small>{r.message}</small>
                    </div>

                    <span className={`status ${r.status}`}>
                      {r.status}
                    </span>

                    {isIncoming && r.status === 'pending' && (
                      <>
                        <button
                          className="primary small"
                          onClick={() => changeRequest(r._id, 'accepted')}
                        >
                          Accept
                        </button>

                        <button
                          className="secondary small"
                          onClick={() => changeRequest(r._id, 'rejected')}
                        >
                          Decline
                        </button>
                      </>
                    )}
                  </div>
                );
              })
            ) : (
              <Empty text="No requests yet. Discover someone to start an exchange." />
            )}
          </div>
        )}

        {page === 'chat' && (
          <div className="chat-layout">
            <div className="panel chat-people">
              <h3>Conversations</h3>

              {people.length ? (
                people
                  .filter(p => getId(p) !== getId(user))
                  .map(p => (
                    <button
                      type="button"
                      className={`person-line ${
                        getId(selected) === getId(p) ? 'chosen' : ''
                      }`}
                      key={p._id}
                      onClick={() => openChat(p)}
                    >
                      <div className="avatar">{initials(p.name)}</div>
                      <b>{p.name}</b>
                    </button>
                  ))
              ) : (
                <Empty text="No other members found." />
              )}
            </div>

            <div className="panel chat-window">
              {selected ? (
                <>
                  <div className="chat-head">
                    <div className="avatar">{initials(selected.name)}</div>
                    <b>{selected.name}</b>
                  </div>

                  <div className="messages">
                    {chatLoading ? (
                      <Empty text="Loading conversation..." />
                    ) : messages.length ? (
                      messages.map((m, i) => (
                        <div
                          key={m._id || i}
                          className={`bubble ${
                            getId(m.from) === getId(user) ? 'mine' : ''
                          }`}
                        >
                          {m.text}

                          <small>
                            {new Date(
                              m.createdAt || m.at || Date.now()
                            ).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </small>
                        </div>
                      ))
                    ) : (
                      <Empty text="No messages yet. Say hello!" />
                    )}
                  </div>

                  <form className="send-row" onSubmit={sendMessage}>
                    <input
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      placeholder="Write a message..."
                      disabled={chatLoading}
                    />

                    <button
                      type="submit"
                      className="primary"
                      disabled={!message.trim() || chatLoading}
                    >
                      Send ↑
                    </button>
                  </form>
                </>
              ) : (
                <Empty text="Choose a person to start chatting." />
              )}
            </div>
          </div>
        )}

        {page === 'profile' && (
          <div className="panel form-panel">
            <p className="eyebrow">YOUR IDENTITY</p>
            <h3>Build your learning profile</h3>

            <form onSubmit={saveProfile} className="form-grid">
              <label>
                Full name
                <input
                  value={profile.name || ''}
                  onChange={e => setProfile({ ...profile, name: e.target.value })}
                />
              </label>

              <label>
                Location
                <input
                  value={profile.location || ''}
                  onChange={e => setProfile({ ...profile, location: e.target.value })}
                />
              </label>

              <label className="wide">
                About you
                <textarea
                  rows="4"
                  value={profile.bio || ''}
                  onChange={e => setProfile({ ...profile, bio: e.target.value })}
                  placeholder="Tell the community what you enjoy learning..."
                />
              </label>

              <label>
                Skills you can teach
                <small>Comma separated</small>
                <input
                  value={profile.skillsOffered || ''}
                  onChange={e =>
                    setProfile({ ...profile, skillsOffered: e.target.value })
                  }
                  placeholder="React, photography, Excel"
                />
              </label>

              <label>
                Skills you want to learn
                <small>Comma separated</small>
                <input
                  value={profile.skillsWanted || ''}
                  onChange={e =>
                    setProfile({ ...profile, skillsWanted: e.target.value })
                  }
                  placeholder="Python, design, guitar"
                />
              </label>

              <div className="wide">
                <button className="primary">Save profile</button>
              </div>
            </form>
          </div>
        )}

        {page === 'sessions' && (
          <>
            <div className="panel form-panel">
              <h3>Schedule a skill session</h3>

              <form className="form-grid" onSubmit={createSession}>
                <label>
                  Partner
                  <select
                    required
                    value={schedule.guest}
                    onChange={e => setSchedule({ ...schedule, guest: e.target.value })}
                  >
                    <option value="">Choose a member</option>
                    {people.map(p => (
                      <option key={p._id} value={p._id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Session title
                  <input
                    required
                    value={schedule.title}
                    onChange={e => setSchedule({ ...schedule, title: e.target.value })}
                  />
                </label>

                <label>
                  Date and time
                  <input
                    required
                    type="datetime-local"
                    value={schedule.startsAt}
                    onChange={e => setSchedule({ ...schedule, startsAt: e.target.value })}
                  />
                </label>

                <label>
                  Notes
                  <input
                    value={schedule.notes}
                    onChange={e => setSchedule({ ...schedule, notes: e.target.value })}
                  />
                </label>

                <div className="wide">
                  <button className="primary">Create session</button>
                </div>
              </form>
            </div>

            <div className="panel">
              <h3>Your sessions</h3>

              {sessions.map(s => (
                <div className="list-row" key={s._id}>
                  <div className="grow">
                    <b>{s.title}</b>
                    <p className="muted">
                      {s.host?.name} with {s.guest?.name} ·{' '}
                      {new Date(s.startsAt).toLocaleString()}
                    </p>
                  </div>

                  <span className="status">{s.status}</span>

                  {s.status === 'scheduled' && (
                    <button
                      className="secondary small"
                      onClick={async () => {
                        try {
                          await api(`/extra/sessions/${s._id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ status: 'cancelled' })
                          });

                          const d = await api('/extra/sessions');
                          setSessions(d.sessions || []);
                        } catch (e) {
                          setError(e.message);
                        }
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {page === 'progress' && (
          <div className="panel">
            <p className="eyebrow">YOUR LEARNING JOURNEY</p>
            <h3>Skill progress tracker</h3>
            <p className="muted">
              Track your learning goals by updating your profile skills.
              Progress is stored locally in this browser.
            </p>

            <Progress skills={list(user?.skillsWanted)} />
          </div>
        )}

        {page === 'leaderboard' && <Leaderboard />}

        {page === 'notifications' && (
          <div className="panel">
            <div className="section-head">
              <h3>Notifications</h3>

              <button className="text-btn" onClick={markNotifications}>
                Mark all as read
              </button>
            </div>

            {notifications.length ? (
              notifications.map(n => (
                <div
                  className={`list-row ${n.read ? '' : 'unread'}`}
                  key={n._id}
                >
                  <div className="notice-icon">✦</div>

                  <div className="grow">
                    <b>{n.text}</b>
                    <small className="muted">
                      {new Date(n.createdAt).toLocaleString()}
                    </small>
                  </div>
                </div>
              ))
            ) : (
              <Empty text="You're all caught up." />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function Empty({ text }) {
  return (
    <div className="empty">
      <div>✳</div>
      <p>{text}</p>
    </div>
  );
}

function PersonCard({ p, onRequest, onChat }) {
  return (
    <article className="person-card">
      <div className="person-top">
        <div className="avatar large">{initials(p.name)}</div>
        <span className="match">{p.match || 0}% match</span>
      </div>

      <h3>{p.name}</h3>
      <p className="muted">{p.location || 'Community member'}</p>

      <p className="bio">
        {p.bio || 'Ready to share knowledge and learn something new.'}
      </p>

      <div className="tags">
        {list(p.skillsOffered).slice(0, 4).map(s => (
          <span key={s}>{s}</span>
        ))}
      </div>

      <div className="card-actions">
        <button className="primary small" onClick={() => onRequest(p)}>
          Request swap
        </button>

        <button className="secondary small" onClick={() => onChat(p)}>
          Message
        </button>
      </div>
    </article>
  );
}

function Progress({ skills }) {
  const [values, setValues] = useState(
    () => JSON.parse(localStorage.getItem('skillswap_progress') || '{}')
  );

  function update(k, v) {
    const n = { ...values, [k]: Number(v) };
    setValues(n);
    localStorage.setItem('skillswap_progress', JSON.stringify(n));
  }

  return skills.length ? (
    skills.map(s => (
      <div className="progress-item" key={s}>
        <div>
          <b>{s}</b>
          <span>{values[s] || 0}%</span>
        </div>

        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value={values[s] || 0}
          onChange={e => update(s, e.target.value)}
        />
      </div>
    ))
  ) : (
    <Empty text="Add skills you want to learn in My profile to track progress." />
  );
}

function Leaderboard() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    api('/extra/leaderboard')
      .then(d => setRows(d.users || []))
      .catch(() => {});
  }, []);

  return (
    <div className="panel">
      <p className="eyebrow">COMMUNITY SPOTLIGHT</p>
      <h3>Top rated members</h3>

      {rows.map((u, i) => (
        <div className="list-row" key={u._id}>
          <b className="rank">#{i + 1}</b>
          <div className="avatar">{initials(u.name)}</div>

          <div className="grow">
            <b>{u.name}</b>
            <p className="muted">
              {(u.skillsOffered || []).join(' · ')}
            </p>
          </div>

          <span>
            ★ {Number(u.rating || 0).toFixed(1)} ({u.reviews})
          </span>
        </div>
      ))}
    </div>
  );
}
