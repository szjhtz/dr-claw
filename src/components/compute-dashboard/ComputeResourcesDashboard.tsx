import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Monitor,
  Cpu,
  MemoryStick,
  Thermometer,
  Zap,
  RefreshCw,
  Server,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Laptop,
  Plus,
  Trash2,
  Plug,
  Unplug,
  X,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { api } from '../../utils/api';

type GpuInfo = {
  index: number;
  name: string;
  gpuUtil: number;
  memUtil: number;
  memUsedMB: number;
  memTotalMB: number;
  tempC: number;
  powerW: number;
};

type CpuInfo = {
  cores: number;
  model?: string;
  loadAvg: number;
  utilPercent: number;
  memTotalMB: number;
  memUsedMB: number;
  memUtilPercent: number;
};

type MonitorData = {
  success: boolean;
  gpus: GpuInfo[];
  cpu: CpuInfo | null;
  error?: string;
  timestamp: number;
};

type LocalMonitorData = MonitorData & {
  hostname?: string;
  platform?: string;
};

type ComputeNode = {
  id: string;
  name: string;
  host: string;
  user: string;
  port?: number;
  type: string;
  hasPassword?: boolean;
  workDir?: string;
};

type NodeWithMonitor = {
  node: ComputeNode;
  monitor: MonitorData | null;
  loading: boolean;
  isActive: boolean;
};

type NodeFormData = {
  name: string;
  host: string;
  user: string;
  port: string;
  authType: 'key' | 'password';
  key: string;
  password: string;
  workDir: string;
  type: 'direct' | 'slurm';
};

const defaultFormData: NodeFormData = {
  name: '',
  host: '',
  user: '',
  port: '22',
  authType: 'key',
  key: '',
  password: '',
  workDir: '~',
  type: 'direct',
};

const POLL_INTERVAL_MS = 15_000;

// ─── Utility sub-components ───

function UtilBar({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="w-full h-2 rounded-full bg-muted/60 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

function utilColor(percent: number): string {
  if (percent < 40) return 'bg-emerald-500';
  if (percent < 70) return 'bg-amber-500';
  return 'bg-red-500';
}

function utilTextColor(percent: number): string {
  if (percent < 40) return 'text-emerald-600 dark:text-emerald-400';
  if (percent < 70) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function formatMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
        active
          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
          : 'bg-muted text-muted-foreground'
      }`}
    >
      {active ? 'In Use' : 'Idle'}
    </span>
  );
}

// ─── Resource cards ───

function GpuCard({ gpu }: { gpu: GpuInfo }) {
  const inUse = gpu.gpuUtil > 5 || gpu.memUtil > 5;

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Monitor className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">GPU {gpu.index}</span>
        </div>
        <StatusBadge active={inUse} />
      </div>

      <p className="text-xs text-muted-foreground truncate">{gpu.name}</p>

      <div className="space-y-2">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">GPU Utilization</span>
            <span className={`text-xs font-semibold ${utilTextColor(gpu.gpuUtil)}`}>
              {gpu.gpuUtil}%
            </span>
          </div>
          <UtilBar percent={gpu.gpuUtil} color={utilColor(gpu.gpuUtil)} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">VRAM</span>
            <span className="text-xs text-muted-foreground">
              {formatMB(gpu.memUsedMB)} / {formatMB(gpu.memTotalMB)}
            </span>
          </div>
          <UtilBar percent={gpu.memUtil} color={utilColor(gpu.memUtil)} />
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
        <span className="flex items-center gap-1">
          <Thermometer className="h-3 w-3" />
          {gpu.tempC}°C
        </span>
        <span className="flex items-center gap-1">
          <Zap className="h-3 w-3" />
          {gpu.powerW > 0 ? `${gpu.powerW} W` : 'N/A'}
        </span>
      </div>
    </div>
  );
}

function CpuCard({ cpu }: { cpu: CpuInfo }) {
  const inUse = cpu.utilPercent > 10;

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">CPU</span>
          <span className="text-xs text-muted-foreground">({cpu.cores} cores)</span>
        </div>
        <StatusBadge active={inUse} />
      </div>

      {cpu.model && (
        <p className="text-xs text-muted-foreground truncate">{cpu.model}</p>
      )}

      <div className="space-y-2">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">CPU Load</span>
            <span className={`text-xs font-semibold ${utilTextColor(cpu.utilPercent)}`}>
              {cpu.utilPercent}%
            </span>
          </div>
          <UtilBar percent={cpu.utilPercent} color={utilColor(cpu.utilPercent)} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <MemoryStick className="h-3 w-3" />
              System Memory
            </span>
            <span className="text-xs text-muted-foreground">
              {formatMB(cpu.memUsedMB)} / {formatMB(cpu.memTotalMB)}
            </span>
          </div>
          <UtilBar percent={cpu.memUtilPercent} color={utilColor(cpu.memUtilPercent)} />
        </div>
      </div>

      <div className="text-xs text-muted-foreground pt-1">
        Load average: {cpu.loadAvg.toFixed(2)}
      </div>
    </div>
  );
}

function ResourceCards({ monitor }: { monitor: MonitorData }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {monitor.cpu && <CpuCard cpu={monitor.cpu} />}
      {monitor.gpus.map((gpu) => (
        <GpuCard key={gpu.index} gpu={gpu} />
      ))}
    </div>
  );
}

// ─── Node card (with connect/disconnect/delete) ───

function NodeCard({
  data,
  isConnected,
  onConnect,
  onDisconnect,
  onDelete,
}: {
  data: NodeWithMonitor;
  isConnected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onDelete: () => void;
}) {
  const { node, monitor, loading, isActive } = data;
  const hasData = monitor?.success && (monitor.gpus.length > 0 || monitor.cpu);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-base font-semibold">{node.name}</h3>
          </div>
          <span className="text-xs text-muted-foreground">
            {node.user}@{node.host}
            {node.port && node.port !== 22 ? `:${node.port}` : ''}
          </span>
          {isActive && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 font-medium">
              Active
            </span>
          )}
          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            {node.type === 'slurm' ? 'Slurm HPC' : 'Direct GPU'}
          </span>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
      </div>

      {/* Monitor data (only when connected) */}
      {isConnected && monitor && !monitor.success && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{monitor.error || 'Failed to connect'}</span>
        </div>
      )}

      {isConnected && hasData && monitor && <ResourceCards monitor={monitor} />}

      {isConnected && !loading && !hasData && monitor?.success && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          <span>Connected — no GPU detected on this node</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-1">
        {isConnected ? (
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={onDisconnect}
          >
            <Unplug className="h-3.5 w-3.5 mr-1.5" />
            Disconnect
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={onConnect}
            disabled={loading}
          >
            <Plug className="h-3.5 w-3.5 mr-1.5" />
            Connect
          </Button>
        )}

        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Delete this node?</span>
            <Button
              variant="destructive"
              size="sm"
              className="rounded-xl h-7 text-xs"
              onClick={() => { setConfirmDelete(false); onDelete(); }}
            >
              Confirm
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl h-7 text-xs"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="rounded-xl text-muted-foreground hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Add Node form (inline) ───

function AddNodeForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (data: NodeFormData) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<NodeFormData>({ ...defaultFormData });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (field: keyof NodeFormData, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async () => {
    if (!form.host.trim()) { setError('Host is required'); return; }
    if (!form.user.trim()) { setError('Username is required'); return; }
    const port = parseInt(form.port);
    if (form.port && (isNaN(port) || port < 1 || port > 65535)) {
      setError('Port must be between 1 and 65535');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(form);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to add node');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Add Remote Node</h3>
        <Button variant="ghost" size="sm" className="rounded-xl" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Name (optional)</label>
          <Input
            placeholder="My GPU Server"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            className="rounded-xl h-9"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Host *</label>
          <Input
            placeholder="192.168.1.100 or hostname"
            value={form.host}
            onChange={(e) => update('host', e.target.value)}
            className="rounded-xl h-9"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Username *</label>
          <Input
            placeholder="root"
            value={form.user}
            onChange={(e) => update('user', e.target.value)}
            className="rounded-xl h-9"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Port</label>
          <Input
            placeholder="22"
            value={form.port}
            onChange={(e) => update('port', e.target.value)}
            className="rounded-xl h-9"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Work Directory</label>
          <Input
            placeholder="~"
            value={form.workDir}
            onChange={(e) => update('workDir', e.target.value)}
            className="rounded-xl h-9"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Node Type</label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={form.type === 'direct' ? 'secondary' : 'outline'}
              size="sm"
              className="rounded-xl flex-1 h-9"
              onClick={() => update('type', 'direct')}
            >
              Direct GPU
            </Button>
            <Button
              type="button"
              variant={form.type === 'slurm' ? 'secondary' : 'outline'}
              size="sm"
              className="rounded-xl flex-1 h-9"
              onClick={() => update('type', 'slurm')}
            >
              Slurm HPC
            </Button>
          </div>
        </div>
      </div>

      {/* Auth section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Authentication</label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={form.authType === 'key' ? 'secondary' : 'outline'}
              size="sm"
              className="rounded-xl h-7 text-xs"
              onClick={() => update('authType', 'key')}
            >
              SSH Key
            </Button>
            <Button
              type="button"
              variant={form.authType === 'password' ? 'secondary' : 'outline'}
              size="sm"
              className="rounded-xl h-7 text-xs"
              onClick={() => update('authType', 'password')}
            >
              Password
            </Button>
          </div>
        </div>
        {form.authType === 'key' ? (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">SSH Key (path or content)</label>
            <Input
              placeholder="~/.ssh/id_rsa or paste key content"
              value={form.key}
              onChange={(e) => update('key', e.target.value)}
              className="rounded-xl h-9"
            />
          </div>
        ) : (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Password</label>
            <Input
              type="password"
              placeholder="SSH password"
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              className="rounded-xl h-9"
            />
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" className="rounded-xl" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="rounded-xl"
          onClick={() => void handleSubmit()}
          disabled={submitting}
        >
          {submitting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          Add Node
        </Button>
      </div>
    </div>
  );
}

// ─── Summary card ───

function SummaryCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string | number;
  sublabel?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-xl font-bold">
        {value}
        {sublabel && (
          <span className="text-xs font-normal text-muted-foreground ml-1">{sublabel}</span>
        )}
      </p>
    </div>
  );
}

// ─── Main dashboard ───

export default function ComputeResourcesDashboard() {
  const [localData, setLocalData] = useState<LocalMonitorData | null>(null);
  const [localLoading, setLocalLoading] = useState(true);
  const [nodesData, setNodesData] = useState<NodeWithMonitor[]>([]);
  const [connectedNodeIds, setConnectedNodeIds] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Data fetchers ───

  const fetchLocalMonitor = useCallback(async () => {
    try {
      const resp = await api.compute.monitorLocal();
      return (await resp.json()) as LocalMonitorData;
    } catch {
      return { success: false, gpus: [], cpu: null, error: 'Network error', timestamp: Date.now() } as LocalMonitorData;
    }
  }, []);

  const fetchNodes = useCallback(async () => {
    try {
      const resp = await api.compute.getNodes();
      const data = (await resp.json()) as { nodes: ComputeNode[]; activeNodeId?: string };
      return { nodes: data.nodes || [], activeNodeId: data.activeNodeId };
    } catch {
      return { nodes: [], activeNodeId: undefined };
    }
  }, []);

  const monitorNode = useCallback(async (nodeId: string): Promise<MonitorData> => {
    try {
      const resp = await api.compute.monitorNode(nodeId);
      return (await resp.json()) as MonitorData;
    } catch {
      return { success: false, gpus: [], cpu: null, error: 'Network error', timestamp: Date.now() };
    }
  }, []);

  // ─── Initial load (no auto-connect) ───

  const loadInitial = useCallback(async () => {
    setLocalLoading(true);
    const [localResult, { nodes, activeNodeId }] = await Promise.all([
      fetchLocalMonitor(),
      fetchNodes(),
    ]);
    setLocalData(localResult);
    setLocalLoading(false);
    setNodesData(
      nodes.map((node) => ({
        node,
        monitor: null,
        loading: false,
        isActive: node.id === activeNodeId,
      })),
    );
    setInitialLoad(false);
  }, [fetchLocalMonitor, fetchNodes]);

  // ─── Poll only connected nodes + local ───

  const pollConnected = useCallback(async () => {
    const localResult = await fetchLocalMonitor();
    setLocalData(localResult);

    if (connectedNodeIds.size > 0) {
      const results = await Promise.allSettled(
        Array.from(connectedNodeIds).map(async (nodeId) => {
          const monitor = await monitorNode(nodeId);
          return { nodeId, monitor };
        }),
      );
      setNodesData((prev) =>
        prev.map((item) => {
          const result = results.find(
            (r) => r.status === 'fulfilled' && r.value.nodeId === item.node.id,
          );
          if (result?.status === 'fulfilled') {
            return { ...item, monitor: result.value.monitor, loading: false };
          }
          return item;
        }),
      );
    }
  }, [connectedNodeIds, fetchLocalMonitor, monitorNode]);

  // ─── Connect / Disconnect ───

  const connectNode = useCallback(
    async (nodeId: string) => {
      setConnectedNodeIds((prev) => new Set(prev).add(nodeId));
      setNodesData((prev) =>
        prev.map((item) =>
          item.node.id === nodeId ? { ...item, loading: true } : item,
        ),
      );
      const monitor = await monitorNode(nodeId);
      setNodesData((prev) =>
        prev.map((item) =>
          item.node.id === nodeId ? { ...item, monitor, loading: false } : item,
        ),
      );
    },
    [monitorNode],
  );

  const disconnectNode = useCallback((nodeId: string) => {
    setConnectedNodeIds((prev) => {
      const next = new Set(prev);
      next.delete(nodeId);
      return next;
    });
    setNodesData((prev) =>
      prev.map((item) =>
        item.node.id === nodeId ? { ...item, monitor: null, loading: false } : item,
      ),
    );
  }, []);

  // ─── Node CRUD ───

  const handleAddNode = useCallback(
    async (formData: NodeFormData) => {
      const resp = await api.compute.addNode({
        name: formData.name.trim() || formData.host.trim(),
        host: formData.host.trim(),
        user: formData.user.trim(),
        port: parseInt(formData.port) || 22,
        authType: formData.authType,
        key: formData.authType === 'key' ? formData.key : undefined,
        password: formData.authType === 'password' ? formData.password : undefined,
        workDir: formData.workDir.trim() || '~',
        type: formData.type,
      });
      const result = await resp.json();
      if (!result.success) throw new Error(result.error || 'Failed to add node');
      // Refresh node list
      const { nodes, activeNodeId } = await fetchNodes();
      setNodesData(
        nodes.map((node) => ({
          node,
          monitor: null,
          loading: false,
          isActive: node.id === activeNodeId,
        })),
      );
      setShowAddForm(false);
    },
    [fetchNodes],
  );

  const handleDeleteNode = useCallback(
    async (nodeId: string) => {
      try {
        await api.compute.deleteNode(nodeId);
      } catch {
        // ignore — node may already be gone
      }
      setConnectedNodeIds((prev) => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
      setNodesData((prev) => prev.filter((item) => item.node.id !== nodeId));
    },
    [],
  );

  // ─── Refresh (manual) ───

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setLocalLoading(true);
    try {
      const [localResult, { nodes, activeNodeId }] = await Promise.all([
        fetchLocalMonitor(),
        fetchNodes(),
      ]);
      setLocalData(localResult);
      setLocalLoading(false);
      // Merge new node list with existing monitor data for connected nodes
      setNodesData(
        nodes.map((node) => {
          const existing = nodesData.find((d) => d.node.id === node.id);
          return {
            node,
            monitor: connectedNodeIds.has(node.id) ? (existing?.monitor ?? null) : null,
            loading: false,
            isActive: node.id === activeNodeId,
          };
        }),
      );
      // Re-poll connected nodes
      if (connectedNodeIds.size > 0) {
        const results = await Promise.allSettled(
          Array.from(connectedNodeIds).map(async (id) => {
            const monitor = await monitorNode(id);
            return { nodeId: id, monitor };
          }),
        );
        setNodesData((prev) =>
          prev.map((item) => {
            const result = results.find(
              (r) => r.status === 'fulfilled' && r.value.nodeId === item.node.id,
            );
            if (result?.status === 'fulfilled') {
              return { ...item, monitor: result.value.monitor };
            }
            return item;
          }),
        );
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [connectedNodeIds, fetchLocalMonitor, fetchNodes, monitorNode, nodesData]);

  // ─── Effects ───

  const loadInitialRef = useRef(loadInitial);
  loadInitialRef.current = loadInitial;

  useEffect(() => {
    void loadInitialRef.current();
  }, []);

  const pollConnectedRef = useRef(pollConnected);
  pollConnectedRef.current = pollConnected;

  useEffect(() => {
    if (initialLoad) return;
    if (connectedNodeIds.size === 0) {
      // Still poll local machine
      pollRef.current = setInterval(() => {
        void pollConnectedRef.current();
      }, POLL_INTERVAL_MS);
    } else {
      pollRef.current = setInterval(() => {
        void pollConnectedRef.current();
      }, POLL_INTERVAL_MS);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [connectedNodeIds, initialLoad]);

  // ─── Aggregated stats (local + connected nodes only) ───

  const allMonitors = [
    localData,
    ...nodesData.filter((d) => connectedNodeIds.has(d.node.id)).map((d) => d.monitor),
  ].filter((m): m is MonitorData => !!m && m.success);

  const totalGpus = allMonitors.reduce((n, m) => n + m.gpus.length, 0);
  const activeGpus = allMonitors.reduce(
    (n, m) => n + m.gpus.filter((g) => g.gpuUtil > 5 || g.memUtil > 5).length,
    0,
  );
  const totalCpuCores = allMonitors.reduce((n, m) => n + (m.cpu?.cores ?? 0), 0);
  const cpuMonitors = allMonitors.filter((m) => m.cpu);
  const avgCpuUtil =
    cpuMonitors.length > 0
      ? Math.round(cpuMonitors.reduce((s, m) => s + m.cpu!.utilPercent, 0) / cpuMonitors.length)
      : 0;

  const connectedCount = connectedNodeIds.size;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Compute Resources</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Monitor GPU and CPU usage across your compute nodes
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => setShowAddForm(true)}
              disabled={showAddForm}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Node
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => void handleRefresh()}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {initialLoad ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading compute resources...
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryCard
                label="Nodes"
                value={1 + nodesData.length}
                sublabel={
                  nodesData.length > 0
                    ? `(1 local + ${nodesData.length} remote${connectedCount > 0 ? `, ${connectedCount} connected` : ''})`
                    : '(local)'
                }
              />
              <SummaryCard
                label="GPUs"
                value={totalGpus > 0 ? `${activeGpus} / ${totalGpus}` : '0'}
                sublabel={totalGpus > 0 ? 'in use' : 'detected'}
              />
              <SummaryCard label="CPU Cores" value={totalCpuCores} />
              <SummaryCard label="Avg CPU Load" value={`${avgCpuUtil}%`} />
            </div>

            {/* Local machine */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Laptop className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-base font-semibold">
                    {localData?.hostname || 'Local Machine'}
                  </h3>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 font-medium">
                  This Machine
                </span>
                {localData?.platform && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {localData.platform === 'darwin' ? 'macOS' : localData.platform === 'win32' ? 'Windows' : 'Linux'}
                  </span>
                )}
                {localLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>

              {localData && !localData.success && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{localData.error || 'Failed to read local stats'}</span>
                </div>
              )}

              {localData?.success && (localData.cpu || localData.gpus.length > 0) && (
                <ResourceCards monitor={localData} />
              )}

              {localData?.success && !localData.cpu && localData.gpus.length === 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  <span>No GPU detected on this machine</span>
                </div>
              )}
            </div>

            {/* Remote nodes */}
            <div className="border-t pt-4">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                Remote Nodes
                {nodesData.length > 0 && (
                  <span className="font-normal ml-2">
                    ({connectedCount} of {nodesData.length} connected)
                  </span>
                )}
              </h2>
            </div>

            {/* Add node form */}
            {showAddForm && (
              <AddNodeForm
                onSubmit={handleAddNode}
                onCancel={() => setShowAddForm(false)}
              />
            )}

            {/* Node cards */}
            {nodesData.length > 0 ? (
              <div className="space-y-4">
                {nodesData.map((data) => (
                  <NodeCard
                    key={data.node.id}
                    data={data}
                    isConnected={connectedNodeIds.has(data.node.id)}
                    onConnect={() => void connectNode(data.node.id)}
                    onDisconnect={() => disconnectNode(data.node.id)}
                    onDelete={() => void handleDeleteNode(data.node.id)}
                  />
                ))}
              </div>
            ) : (
              !showAddForm && (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <Server className="h-8 w-8 mb-3 opacity-40" />
                  <p className="text-sm">No remote nodes configured</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl mt-3"
                    onClick={() => setShowAddForm(true)}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Add your first node
                  </Button>
                </div>
              )
            )}

            {/* Timestamp */}
            {connectedCount > 0 && (
              <p className="text-xs text-muted-foreground text-center pt-2">
                Auto-refreshes every {POLL_INTERVAL_MS / 1000}s for connected nodes
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
