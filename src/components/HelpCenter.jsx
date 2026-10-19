import { useEffect, useRef, useState } from 'react';
import { fetchLatestDesktopInstaller } from '../services/desktopRelease';
import { getBrokerInfo } from '../services/brokerAuth.js';
import packageInfo from '../../package.json';
import './HelpCenter.css';

const RELEASES_URL = 'https://github.com/rtx5-orrnn/rtx5-broker-manager-releases/releases';
const topics = [
  ['Market Watch', 'Click a symbol for its details. Double-click to open its tick chart. Cached prices appear immediately; live prices depend on your broker feed.'],
  ['Accounts', 'Select Real Accounts or Demo Accounts on the dashboard to filter the right sidebar. Double-click an account to review its details.'],
  ['Workspace', 'Drag panel dividers to resize your workspace. Close tabs with × and use + for quick navigation. Reset layout restores the default panel arrangement.'],
  ['Saving changes', 'Edit supported account fields and select Update. Wait for the result message before closing. Informational notes are not update confirmations.'],
  ['Connection troubleshooting', 'Check the connection indicator and broker selection. If prices are cached, wait for the feed to reconnect. If the issue continues, record the error message for your broker administrator.'],
];
export default function HelpCenter({ initialSection = 'Guide', onClose }) {
  const dialogRef = useRef(null);
  const [section, setSection] = useState(initialSection);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [failed, setFailed] = useState(false);
  const helpBrokerName = (() => {
    const info = getBrokerInfo();
    const rawName = String(info?.broker_name || info?.name || '').trim();
    return rawName && !/^broker$/i.test(rawName) ? rawName : '';
  })();
  const helpProductTitle = helpBrokerName ? `${helpBrokerName} Manager` : 'Manager';
  const [message, setMessage] = useState(`${helpProductTitle} ${packageInfo.version}\n\nIssue summary:\n\nSteps to reproduce:\n1. \n\nExpected result:\n\nActual result / error message:\n`);
  useEffect(() => { dialogRef.current?.showModal(); }, []);
  const checkUpdates = async () => {
    setBusy(true); setFailed(false); setStatus('Checking for updates…');
    try {
      if (typeof window.rtx5Updater?.checkForUpdates === 'function') {
        const result = await window.rtx5Updater.checkForUpdates();
        setFailed(result?.status === 'error');
        setStatus(result?.message || 'Update check completed.');
      } else {
        const release = await fetchLatestDesktopInstaller({ signal: AbortSignal.timeout(15000) });
        setStatus(`Latest desktop release: ${release.version}. This browser session uses the web app; desktop updates are installed separately.`);
      }
    } catch (error) { setFailed(true); setStatus(error.message || 'Could not check updates. Please try again.'); }
    finally { setBusy(false); }
  };
  const copyMessage = async () => {
    try { await navigator.clipboard.writeText(message); setFailed(false); setStatus('Support message copied. Share it with your broker administrator.'); }
    catch { setFailed(true); setStatus('Copy unavailable. Select the text below and copy it manually.'); }
  };
  return <dialog ref={dialogRef} className="manager-help-center" aria-labelledby="manager-help-title" onCancel={onClose} onClose={onClose}>
    <header><div><h2 id="manager-help-title">Help Center</h2><p>Guidance, updates and support for {helpProductTitle}</p></div><button type="button" onClick={onClose} aria-label="Close Help Center">×</button></header>
    <nav aria-label="Help sections">{['Guide', 'Updates', 'Support', 'About'].map(name => <button type="button" key={name} aria-pressed={section === name} onClick={() => { setSection(name); setStatus(''); }}>{name}</button>)}</nav>
    <div className="manager-help-content">
      {section === 'Guide' && <><label className="manager-help-search">Find a help topic<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search accounts, prices, workspace…" /></label>{topics.filter(t => t.join(' ').toLowerCase().includes(search.toLowerCase())).map(([title, text]) => <section key={title}><h3>{title}</h3><p>{text}</p></section>)}{!topics.some(t => t.join(' ').toLowerCase().includes(search.toLowerCase())) && <p>No matching topics. Try another search or open Support.</p>}</>}
      {section === 'Updates' && <><section><h3>Releases & updates</h3><p>Build version: {packageInfo.version}</p><p>Read published release notes or check for the latest desktop version.</p><div className="manager-help-actions"><button type="button" disabled={busy} onClick={checkUpdates}>{busy ? 'Checking…' : 'Check for updates'}</button><a href={RELEASES_URL} target="_blank" rel="noopener noreferrer">View release notes ?</a></div></section><section><h3>Web app updates</h3><p>The web app is updated by your platform operator. Finish any pending work before refreshing to load a deployed update.</p></section></>}
      {section === 'Support' && <><section><h3>Prepare a support message</h3><p>Describe what happened and copy the message to share with your broker administrator. Do not include passwords, access tokens or client personal data.</p><label>Message<textarea rows={9} value={message} onChange={e => setMessage(e.target.value)} /></label><div className="manager-help-actions"><button type="button" onClick={copyMessage}>Copy support message</button></div></section><p>Messages are not sent from this window.</p></>}
      {section === 'About' && <section><h3>{helpProductTitle}</h3><p>Version {packageInfo.version}</p><p>Workspace for broker accounts, market data and trading operations.</p><p>Account access and available actions depend on the permissions assigned by your broker administrator.</p></section>}
      {status && <p className={`manager-help-status${failed ? ' is-error' : ''}`} role={failed ? 'alert' : 'status'}>{status}</p>}
    </div>
    <footer><span>{helpProductTitle} · {packageInfo.version}</span><button type="button" onClick={onClose}>Close</button></footer>
  </dialog>;
}
