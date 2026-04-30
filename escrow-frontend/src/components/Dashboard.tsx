// src/components/Dashboard.tsx – Backend‑Bypass Version
import { useAccount, useReadContract, useWriteContract } from 'wagmi';
import { useConnect, useDisconnect } from 'wagmi';
import { useState, useEffect } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { CONTRACT_ADDRESS, ABI, StatusEnum } from '../contract';
import { parseEther, formatEther } from 'viem';
import { useAuth } from '../context/AuthContext';

type TabType = 'escrows' | 'create';

// ---------- StatusBadge, ShortAddress, StatCard, ResolveButton (keep as is) ----------
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Active: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    Released: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
    Cancelled: 'bg-red-500/10 text-red-400 border border-red-500/20',
    Disputed: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${map[status] || 'bg-zinc-800 text-zinc-400'}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      {status}
    </span>
  );
}

function ShortAddress({ addr }: { addr: string }) {
  return (
    <span className="font-mono text-xs text-zinc-400 bg-zinc-800/50 px-1.5 py-0.5 rounded">
      {addr?.slice(0, 6)}…{addr?.slice(-4)}
    </span>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-1">
      <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium">{label}</span>
      <span className={`text-2xl font-semibold ${accent}`}>{value}</span>
    </div>
  );
}

function ResolveButton({ id }: { id: number }) {
  const { writeContractAsync } = useWriteContract();
  const handle = async (favorFreelancer: boolean) => {
    try {
      await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'resolveDispute',
        args: [BigInt(id), favorFreelancer],
      });
      toast.success(`Resolved — ${favorFreelancer ? 'freelancer' : 'client'} wins`);
    } catch (err: any) {
      toast.error(err.shortMessage || err.message);
    }
  };
  return (
    <div className="flex gap-1">
      <button onClick={() => handle(true)} className="px-2 py-1 text-xs rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20">Freelancer</button>
      <button onClick={() => handle(false)} className="px-2 py-1 text-xs rounded bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20">Client</button>
    </div>
  );
}

// Corrected EscrowRowOnChain – hooks called unconditionally
function EscrowRowOnChain({
  id,
  onRelease, onCancel, onDispute,
}: {
  id: number;
  onRelease: (id: number) => void;
  onCancel: (id: number) => void;
  onDispute: (id: number) => void;
}) {
  // ✅ Hooks FIRST – at the top, unconditionally
  const { address } = useAccount();
  const { data: escrow, isLoading } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'getEscrow',
    args: [BigInt(id)],
  });

  // Now it's safe to use conditionals
  if (isLoading) {
    return <tr><td colSpan={7} className="px-6 py-3 text-center text-xs text-zinc-500">Loading …</td></tr>;
  }
  if (!escrow) return null;

  // Extract data
  const client = (escrow as any).client;
  const freelancer = (escrow as any).freelancer;
  const arbiter = (escrow as any).arbiter;
  const amount = (escrow as any).amount;
  const deadline = (escrow as any).deadline;
  const status = (escrow as any).status;
  const statusNum = Number(status);
  const statusText = StatusEnum[statusNum as 0 | 1 | 2 | 3] || 'Unknown';
  const amountEth = formatEther(BigInt(amount));
  const deadlineDate = new Date(Number(deadline) * 1000).toLocaleDateString();

  // Compare addresses
  const walletLc = address?.toLowerCase();
  const isClient = client?.toLowerCase() === walletLc;
  const isFreelancer = freelancer?.toLowerCase() === walletLc;
  const isArbiter = arbiter?.toLowerCase() === walletLc;
  const beforeDeadline = Date.now() / 1000 < Number(deadline);
  const showRelease = isClient && statusText === 'Active' && beforeDeadline;
  const showCancel = isClient && statusText === 'Active';
  const showDispute = (isClient || isFreelancer) && statusText === 'Active';
  const showResolve = isArbiter && statusText === 'Disputed';

  return (
    <tr className="border-b border-zinc-800/60 hover:bg-zinc-800/20 transition-colors">
      <td className="px-6 py-4 text-sm font-mono text-zinc-400">#{id}</td>
      <td className="px-6 py-4"><ShortAddress addr={client} /></td>
      <td className="px-6 py-4"><ShortAddress addr={freelancer} /></td>
      <td className="px-6 py-4">
        <span className="text-sm font-medium text-zinc-200">{parseFloat(amountEth).toFixed(4)}</span>
        <span className="text-xs text-zinc-500 ml-1">ETH</span>
      </td>
      <td className="px-6 py-4 text-xs text-zinc-500">{deadlineDate}</td>
      <td className="px-6 py-4"><StatusBadge status={statusText} /></td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          {showRelease && <button onClick={() => onRelease(id)} className="px-2.5 py-1 text-xs rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20">Release</button>}
          {showCancel && <button onClick={() => onCancel(id)} className="px-2.5 py-1 text-xs rounded bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20">Cancel</button>}
          {showDispute && <button onClick={() => onDispute(id)} className="px-2.5 py-1 text-xs rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20">Dispute</button>}
          {showResolve && <ResolveButton id={id} />}
          {!showRelease && !showCancel && !showDispute && !showResolve && <span className="text-xs text-zinc-600">—</span>}
        </div>
      </td>
    </tr>
  );
}
// ---------- Create Form – unchanged ----------
function CreateForm({ onSuccess }: { onSuccess: () => void }) {
  const { address } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const [form, setForm] = useState({
    freelancer: '', arbiter: '', deadlineDays: 10, amount: '0.01', title: '', description: '',
  });

  const handle = async () => {
    if (!address) return toast.error('Connect wallet first');
    try {
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'createEscrow',
        args: [
          form.freelancer as `0x${string}`,
          form.arbiter as `0x${string}`,
          BigInt(form.deadlineDays),
        ],
        value: parseEther(form.amount),
      });
      toast.loading('Transaction sent, waiting for confirmation...', { id: 'create' });
      // Simplified wait (in production use waitForTransactionReceipt)
      setTimeout(async () => {
        toast.success('Escrow created!', { id: 'create' });
        setForm({ freelancer: '', arbiter: '', deadlineDays: 10, amount: '0.01', title: '', description: '' });
        onSuccess(); // refresh escrow list
      }, 3000);
    } catch (err: any) {
      toast.error(err.shortMessage || err.message);
    }
  };

  const inputClass = "w-full bg-zinc-900 border border-zinc-700 text-zinc-200 rounded-lg px-3.5 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-colors";

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Freelancer Address</label>
          <input type="text" placeholder="0x..." value={form.freelancer} onChange={(e) => setForm({...form, freelancer: e.target.value})} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Arbiter Address</label>
          <input type="text" placeholder="0x..." value={form.arbiter} onChange={(e) => setForm({...form, arbiter: e.target.value})} className={inputClass} />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Deadline (days)</label>
          <input type="number" min={1} max={365} value={form.deadlineDays} onChange={(e) => setForm({...form, deadlineDays: parseInt(e.target.value)})} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Amount (ETH)</label>
          <input type="text" placeholder="0.01" value={form.amount} onChange={(e) => setForm({...form, amount: e.target.value})} className={inputClass} />
        </div>
      </div>
      <div className="flex items-center gap-3 pt-2">
        <button onClick={handle} disabled={isPending} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
          {isPending ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Creating…</> : 'Create Escrow'}
        </button>
      </div>
    </div>
  );
}

// ---------- Main Dashboard – NO LOGIN REQUIRED ----------
export default function Dashboard() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { logout } = useAuth(); // we ignore login, but keep logout for convenience

  const [activeTab, setActiveTab] = useState<TabType>('escrows');
  const [escrowIds, setEscrowIds] = useState<number[]>([]);
  const [loadingIds, setLoadingIds] = useState(false);

  // Read nextEscrowId to know all escrow IDs
  const { data: nextId, refetch: refetchNextId } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'nextEscrowId',
  });

  useEffect(() => {
    if (nextId !== undefined && Number(nextId) > 0) {
      const ids: number[] = [];
      for (let i = 0; i < Number(nextId); i++) ids.push(i);
      setEscrowIds(ids);
    } else {
      setEscrowIds([]);
    }
  }, [nextId]);

  const refreshEscrows = () => {
    refetchNextId();
  };

  const { writeContractAsync } = useWriteContract();

  const handleRelease = async (id: number) => {
    try {
      await writeContractAsync({ address: CONTRACT_ADDRESS, abi: ABI, functionName: 'release', args: [BigInt(id)] });
      toast.success('Release transaction sent');
      setTimeout(refreshEscrows, 2000);
    } catch (err: any) { toast.error(err.shortMessage || err.message); }
  };
  const handleCancel = async (id: number) => {
    try {
      await writeContractAsync({ address: CONTRACT_ADDRESS, abi: ABI, functionName: 'cancel', args: [BigInt(id)] });
      toast.success('Cancel transaction sent');
      setTimeout(refreshEscrows, 2000);
    } catch (err: any) { toast.error(err.shortMessage || err.message); }
  };
  const handleDispute = async (id: number) => {
    try {
      await writeContractAsync({ address: CONTRACT_ADDRESS, abi: ABI, functionName: 'raiseDispute', args: [BigInt(id)] });
      toast.success('Dispute raised');
      setTimeout(refreshEscrows, 2000);
    } catch (err: any) { toast.error(err.shortMessage || err.message); }
  };

  // Not connected: show wallet connect buttons
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Toaster position="top-right" />
        <div className="w-full max-w-sm mx-4 text-center">
          <div className="w-12 h-12 bg-indigo-600/20 rounded-xl flex items-center justify-center mx-auto mb-4">🔒</div>
          <h1 className="text-xl font-semibold text-zinc-100">Freelance Escrow</h1>
          <p className="text-sm text-zinc-500 mb-6">Connect your wallet to continue</p>
          <div className="space-y-2">
            {connectors.map(c => (
              <button key={c.id} onClick={() => connect({ connector: c })} className="w-full py-2 bg-zinc-800 rounded-lg">{c.name}</button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Connected – show dashboard immediately (no login needed)
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <Toaster position="top-right" />
      <nav className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <span className="font-semibold text-zinc-100 text-sm">Escrow</span>
            <span className="text-zinc-600 text-xs px-2 py-0.5 bg-zinc-800 rounded-full border border-zinc-700">zkSync Sepolia</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-zinc-400 bg-zinc-800/50 px-2.5 py-1.5 rounded-lg">
              {address?.slice(0, 6)}…{address?.slice(-4)}
            </span>
            <button
              onClick={() => {
                localStorage.clear();
                logout();
                disconnect();
              }}
              className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
            >
              Disconnect
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <StatCard label="Total Escrows" value={String(escrowIds.length)} accent="text-zinc-100" />
          <StatCard label="Network" value="zkSync" accent="text-indigo-400" />
          <StatCard label="Chain ID" value="300" accent="text-emerald-400" />
          <StatCard label="Connected" value="Yes" accent="text-blue-400" />
        </div>

        <div className="flex gap-1 mb-6 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit">
          {(['escrows', 'create'] as TabType[]).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 text-sm rounded-lg capitalize transition-colors ${activeTab === tab ? 'bg-indigo-600 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'}`}>
              {tab === 'create' ? '+ New Escrow' : 'Escrows'}
            </button>
          ))}
        </div>

        {activeTab === 'create' && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h2 className="text-sm font-medium text-zinc-300 mb-5">Create New Escrow</h2>
            <CreateForm onSuccess={() => { refreshEscrows(); setActiveTab('escrows'); }} />
          </div>
        )}

        {activeTab === 'escrows' && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-sm font-medium text-zinc-300">All Escrows</h2>
              <button onClick={refreshEscrows} className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1">↻ Refresh</button>
            </div>
            {escrowIds.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-zinc-600 text-sm">No escrows found.</p>
                <button onClick={() => setActiveTab('create')} className="mt-3 text-xs text-indigo-400 hover:text-indigo-300">Create your first escrow →</button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      {['ID','Client','Freelancer','Amount','Deadline','Status','Actions'].map(h => <th key={h} className="px-6 py-3 text-left text-xs font-medium text-zinc-600 uppercase tracking-wider">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {escrowIds.map((id) => (
                      <EscrowRowOnChain key={id} id={id} onRelease={handleRelease} onCancel={handleCancel} onDispute={handleDispute} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}