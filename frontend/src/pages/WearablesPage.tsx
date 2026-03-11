import { useState, useEffect, useCallback } from 'react';
import { AppHeader } from '../components';
import { useT } from '../i18n';
import { useUserStore } from '../stores';
import { healthApi } from '../services/api';

interface DailyMetrics {
  steps: number;
  sleep_hours: number | null;
  mvpa_minutes: number;
  resting_heart_rate: number | null;
  heart_rate_variability: number | null;
}

interface DayData {
  date: string;
  day_label: string;
  steps: number;
  sleep_hours: number | null;
  mvpa_minutes: number;
  resting_heart_rate: number | null;
}

interface WeeklyTrend {
  this_week_avg_steps: number;
  steps_change_percent: number;
  avg_sleep_hours: number;
  deconditioning_alert: boolean;
}

type DeviceType = 'apple_health' | 'hpb_365' | 'google_fit';

const DEVICES: { id: DeviceType; name: string; icon: string; color: string }[] = [
  { id: 'apple_health', name: 'Apple Health', icon: '🍎', color: '#ff3b30' },
  { id: 'hpb_365', name: 'HPB Healthy 365', icon: '🇸🇬', color: '#e8475f' },
  { id: 'google_fit', name: 'Google Fit', icon: '💚', color: '#4285f4' },
];

export function WearablesPage() {
  const t = useT();
  const { userId } = useUserStore();
  const wearableT = (t as any).wearables || {};

  const [connectedDevice, setConnectedDevice] = useState<DeviceType | null>(() => {
    const saved = localStorage.getItem(`silvergait_wearable_${userId}`);
    return saved as DeviceType | null;
  });
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(() =>
    localStorage.getItem(`silvergait_wearable_sync_${userId}`)
  );
  const [today, setToday] = useState<DailyMetrics | null>(null);
  const [weeklyHistory, setWeeklyHistory] = useState<DayData[]>([]);
  const [trend, setTrend] = useState<WeeklyTrend | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!userId) return;
    try {
      const [metricsRes, weeklyRes, trendRes] = await Promise.all([
        healthApi.getDailyMetrics(userId),
        fetch(`/api/health/weekly/${userId}`).then(r => r.json()),
        healthApi.getWeeklyTrend(userId),
      ]);
      setToday(metricsRes as any);
      setWeeklyHistory(weeklyRes);
      setTrend(trendRes as any);
    } catch (e) {
      console.error('Failed to fetch wearable data:', e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (connectedDevice) fetchData();
    else setLoading(false);
  }, [connectedDevice, fetchData]);

  const handleConnect = (device: DeviceType) => {
    setConnectedDevice(device);
    localStorage.setItem(`silvergait_wearable_${userId}`, device);
    const now = new Date().toISOString();
    setLastSync(now);
    localStorage.setItem(`silvergait_wearable_sync_${userId}`, now);
    setLoading(true);
    fetchData();
  };

  const handleDisconnect = () => {
    setConnectedDevice(null);
    localStorage.removeItem(`silvergait_wearable_${userId}`);
    localStorage.removeItem(`silvergait_wearable_sync_${userId}`);
    setLastSync(null);
    setToday(null);
    setWeeklyHistory([]);
    setTrend(null);
  };

  const handleSync = async () => {
    setSyncing(true);
    await fetchData();
    const now = new Date().toISOString();
    setLastSync(now);
    localStorage.setItem(`silvergait_wearable_sync_${userId}`, now);
    setSyncing(false);
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const maxSteps = Math.max(...(weeklyHistory.map(d => d.steps) || [1]), 1);

  const connectedDeviceInfo = DEVICES.find(d => d.id === connectedDevice);

  return (
    <div className="page wearables-page">
      <AppHeader />
      <div className="page-title">
        <h1>{wearableT.title || 'Wearables'}</h1>
        <p className="page-subtitle">{wearableT.subtitle || 'Sync your device for steps & sleep'}</p>
      </div>

      {/* Device Connection */}
      {!connectedDevice ? (
        <div className="wearable-connect-section">
          <h2 className="wearable-section-title">
            {wearableT.connectDevice || 'Connect a Device'}
          </h2>
          <div className="wearable-device-list">
            {DEVICES.map(device => (
              <button
                key={device.id}
                className="wearable-device-card"
                onClick={() => handleConnect(device.id)}
                style={{ '--device-color': device.color } as React.CSSProperties}
              >
                <span className="wearable-device-icon">{device.icon}</span>
                <div className="wearable-device-info">
                  <strong>{device.name}</strong>
                  <span>{wearableT.tapToConnect || 'Tap to connect'}</span>
                </div>
                <svg className="wearable-device-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Connected status bar */}
          <div className="wearable-status-bar">
            <div className="wearable-status-left">
              <span className="wearable-status-dot" />
              <span className="wearable-status-device">
                {connectedDeviceInfo?.icon} {connectedDeviceInfo?.name}
              </span>
              {lastSync && (
                <span className="wearable-status-time">
                  {wearableT.lastSync || 'Synced'} {formatTime(lastSync)}
                </span>
              )}
            </div>
            <div className="wearable-status-actions">
              <button className="wearable-sync-btn" onClick={handleSync} disabled={syncing}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={syncing ? 'spinning' : ''}>
                  <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                  <path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                </svg>
              </button>
              <button className="wearable-disconnect-btn" onClick={handleDisconnect}>
                {wearableT.disconnect || 'Disconnect'}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="wearable-loading">
              <div className="wearable-loading-spinner" />
              <span>{wearableT.syncing || 'Syncing data...'}</span>
            </div>
          ) : (
            <>
              {/* Today's Metrics */}
              <div className="wearable-metrics-grid">
                <div className="wearable-metric-card steps">
                  <div className="wearable-metric-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M4 16l3-3 4 4 4-8 5 6" />
                    </svg>
                  </div>
                  <div className="wearable-metric-value">{today?.steps?.toLocaleString() || '—'}</div>
                  <div className="wearable-metric-label">{wearableT.steps || 'Steps'}</div>
                  <div className="wearable-metric-goal">/ 6,000 {wearableT.goal || 'goal'}</div>
                  <div className="wearable-metric-bar">
                    <div className="wearable-metric-fill" style={{ width: `${Math.min(100, ((today?.steps || 0) / 6000) * 100)}%` }} />
                  </div>
                </div>

                <div className="wearable-metric-card sleep">
                  <div className="wearable-metric-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                    </svg>
                  </div>
                  <div className="wearable-metric-value">{today?.sleep_hours ?? '—'}<span className="wearable-metric-unit">h</span></div>
                  <div className="wearable-metric-label">{wearableT.sleep || 'Sleep'}</div>
                  <div className="wearable-metric-goal">/ 7-8h {wearableT.recommended || 'recommended'}</div>
                  <div className="wearable-metric-bar sleep-bar">
                    <div className="wearable-metric-fill" style={{ width: `${Math.min(100, ((today?.sleep_hours || 0) / 8) * 100)}%` }} />
                  </div>
                </div>

                <div className="wearable-metric-card heart">
                  <div className="wearable-metric-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                  </div>
                  <div className="wearable-metric-value">{today?.resting_heart_rate ?? '—'}<span className="wearable-metric-unit">bpm</span></div>
                  <div className="wearable-metric-label">{wearableT.heartRate || 'Resting HR'}</div>
                </div>

                <div className="wearable-metric-card mvpa">
                  <div className="wearable-metric-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                    </svg>
                  </div>
                  <div className="wearable-metric-value">{today?.mvpa_minutes ?? '—'}<span className="wearable-metric-unit">min</span></div>
                  <div className="wearable-metric-label">{wearableT.mvpa || 'Active Minutes'}</div>
                </div>
              </div>

              {/* Deconditioning Alert */}
              {trend?.deconditioning_alert && (
                <div className="wearable-alert">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <div>
                    <strong>{wearableT.deconditioningAlert || 'Activity Declining'}</strong>
                    <span>{wearableT.deconditioningDesc || 'Your steps dropped over 20% this week. Try a short walk today.'}</span>
                  </div>
                </div>
              )}

              {/* Weekly Steps Chart */}
              <div className="wearable-chart-section">
                <h2 className="wearable-section-title">{wearableT.weeklySteps || 'Weekly Steps'}</h2>
                {trend && (
                  <div className="wearable-trend-badge" data-positive={trend.steps_change_percent >= 0}>
                    {trend.steps_change_percent >= 0 ? '↑' : '↓'} {Math.abs(trend.steps_change_percent)}% vs last week
                  </div>
                )}
                <div className="wearable-bar-chart">
                  {weeklyHistory.map((day, i) => (
                    <div key={day.date} className="wearable-bar-col" style={{ animationDelay: `${i * 60}ms` }}>
                      <div className="wearable-bar-value">{(day.steps / 1000).toFixed(1)}k</div>
                      <div className="wearable-bar-track">
                        <div
                          className="wearable-bar-fill"
                          style={{ height: `${(day.steps / maxSteps) * 100}%` }}
                          data-today={i === weeklyHistory.length - 1}
                        />
                      </div>
                      <div className="wearable-bar-label">{day.day_label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Weekly Sleep Chart */}
              <div className="wearable-chart-section">
                <h2 className="wearable-section-title">{wearableT.weeklySleep || 'Weekly Sleep'}</h2>
                {trend && (
                  <div className="wearable-sleep-avg">
                    {wearableT.avgSleep || 'Avg'}: {trend.avg_sleep_hours}h
                  </div>
                )}
                <div className="wearable-bar-chart sleep-chart">
                  {weeklyHistory.map((day, i) => (
                    <div key={day.date} className="wearable-bar-col" style={{ animationDelay: `${i * 60}ms` }}>
                      <div className="wearable-bar-value">{day.sleep_hours ?? '—'}h</div>
                      <div className="wearable-bar-track">
                        <div
                          className="wearable-bar-fill sleep-fill"
                          style={{ height: `${((day.sleep_hours || 0) / 10) * 100}%` }}
                          data-low={(day.sleep_hours || 0) < 6}
                        />
                      </div>
                      <div className="wearable-bar-label">{day.day_label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
