"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export default function AdminUsers({ initialPage, users, setUsers }) {
  const [cursor, setCursor] = useState(initialPage.nextCursor);
  const [hasMore, setHasMore] = useState(initialPage.hasMore);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sort, setSort] = useState("newest");
  const [error, setError] = useState("");
  const [workingId, setWorkingId] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [adjustingId, setAdjustingId] = useState("");
  const [adjustment, setAdjustment] = useState({ amount: "", direction: "credit", reason: "" });
  const [notice, setNotice] = useState("");
  const [packages, setPackages] = useState([]);
  const [packageTargetId, setPackageTargetId] = useState("");
  const [packageAction, setPackageAction] = useState("extend");
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [extensionDays, setExtensionDays] = useState("30");
  const [exporting, setExporting] = useState(false);
  const filterMounted = useRef(false);
  const searchRequest = useRef(0);

  const searchUsers = useCallback(async () => {
    const requestId = ++searchRequest.current;
    setError("");
    setLoadingMore(true);
    try {
      const query = new URLSearchParams({ search, sort });
      if (roleFilter) query.set("role", roleFilter);
      if (statusFilter) query.set("status", statusFilter);
      const response = await fetch(`/api/admin/users?${query}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not search accounts.");
      if (requestId === searchRequest.current) {
        setUsers(result.users);
        setCursor(result.nextCursor);
        setHasMore(result.hasMore);
      }
    } catch (requestError) {
      if (requestId === searchRequest.current) setError(requestError.message || "Could not search accounts. Please try again.");
    } finally {
      if (requestId === searchRequest.current) setLoadingMore(false);
    }
  }, [roleFilter, search, setUsers, sort, statusFilter]);

  async function applyFilters(event) {
    event.preventDefault();
    await searchUsers();
  }

  useEffect(() => {
    if (!filterMounted.current) {
      filterMounted.current = true;
      return undefined;
    }
    const requestId = ++searchRequest.current;
    const timer = window.setTimeout(() => {
      if (requestId === searchRequest.current) searchUsers();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchUsers]);

  async function downloadContacts() {
    if (exporting) return;
    if (!window.confirm("This CSV contains users’ names, email addresses, and WhatsApp numbers. Store and share it only with authorized staff. Continue?")) return;
    setError("");
    setExporting(true);
    try {
      const response = await fetch("/api/admin/users/export", { cache: "no-store" });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Could not export user contacts.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "ratewell-user-contacts.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("User contact export downloaded.");
    } catch (exportError) {
      setError(exportError.message || "Could not export user contacts.");
    } finally {
      setExporting(false);
    }
  }

  async function loadMore() {
    if (!cursor || loadingMore) return;
    const requestId = searchRequest.current;
    setError("");
    setLoadingMore(true);
    try {
      const response = await fetch(
        `/api/admin/users?${new URLSearchParams({
          cursor,
          search,
          sort,
          ...(roleFilter ? { role: roleFilter } : {}),
          ...(statusFilter ? { status: statusFilter } : {}),
        })}`,
      );
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Could not load more accounts.");
        return;
      }
      if (requestId === searchRequest.current) {
        setUsers((current) => [...current, ...result.users]);
        setCursor(result.nextCursor);
        setHasMore(result.hasMore);
      }
    } catch {
      if (requestId === searchRequest.current) setError("Could not load more accounts. Please try again.");
    } finally {
      if (requestId === searchRequest.current) setLoadingMore(false);
    }
  }

  async function adjustBalance(user, event) {
    event.preventDefault();
    setError("");
    setWorkingId(user.id);
    try {
      const amountMinor = Math.round(Number(adjustment.amount) * 100);
      const response = await fetch("/api/admin/wallet-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          amountMinor,
          direction: adjustment.direction,
          reason: adjustment.reason,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not adjust this wallet.");
      setUsers((current) => current.map((item) => item.id === user.id
        ? { ...item, balanceMinor: result.balanceMinor }
        : item));
      setAdjustment({ amount: "", direction: "credit", reason: "" });
      setAdjustingId("");
    } catch (requestError) {
      setError(requestError.message || "Could not adjust this wallet.");
    } finally {
      setWorkingId("");
    }
  }

  async function openPackageTools(user) {
    setError("");
    setNotice("");
    setPackageTargetId(user.id);
    setPackageAction("extend");
    if (packages.length) return;
    try {
      const response = await fetch("/api/admin/packages", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load active packages.");
      setPackages(result.packages || []);
    } catch (loadError) {
      setPackageTargetId("");
      setError(loadError.message || "Could not load active packages.");
    }
  }

  async function savePackageChange(user, event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setWorkingId(user.id);
    try {
      const body = packageAction === "assign"
        ? { userId: user.id, action: "assign", packageId: selectedPackageId }
        : { userId: user.id, action: "extend", days: Number(extensionDays) };
      const response = await fetch("/api/admin/users/package", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update this package.");
      setUsers((current) => current.map((item) => item.id === user.id
        ? { ...item, ...result.user }
        : item));
      setNotice(result.message);
      setPackageTargetId("");
    } catch (saveError) {
      setError(saveError.message || "Could not update this package.");
    } finally {
      setWorkingId("");
    }
  }

  async function updateUser(user, action) {
    if (
      action === "delete" &&
      !window.confirm(
        `Delete ${user.name}'s account? Their ratings will be retained anonymously.`,
      )
    ) {
      return;
    }

    setError("");
    setWorkingId(user.id);
    try {
      const newPassword =
        action === "reset"
          ? window.prompt("Enter a temporary password (at least 12 characters):")
          : null;
      if (action === "reset" && newPassword === null) return;
      const response = await fetch("/api/admin/users", {
        method: action === "delete" ? "DELETE" : action === "reset" ? "PUT" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "delete"
            ? { userId: user.id }
            : action === "reset"
              ? { userId: user.id, newPassword }
              : action === "role"
                ? { userId: user.id, role: user.role === "moderator" ? "user" : "moderator" }
                : { userId: user.id, active: user.suspended ? true : !user.active },
        ),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Could not update this account.");
        return;
      }

      if (action === "delete") {
        setUsers((current) => current.filter((item) => item.id !== user.id));
      } else if (action !== "reset") {
        setUsers((current) =>
          current.map((item) => (item.id === user.id ? { ...item, ...result.user } : item)),
        );
      } else {
        setError("");
      }
    } catch {
      setError("Could not update this account. Please try again.");
    } finally {
      setWorkingId("");
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
      <div className="mb-5">
        <h2 className="text-xl font-semibold">User accounts</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Disable access or delete an account. Deleted users’ ratings are kept
          without account details.
        </p>
        <p className="mt-2 text-sm text-slate-600">Search by name, email, WhatsApp number, or user ID. Existing accounts without a WhatsApp number can add one in Account settings.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" disabled={exporting} onClick={downloadContacts} className="rounded-xl border border-forest px-4 py-2.5 text-sm font-semibold text-forest hover:bg-mint/40 disabled:opacity-50">{exporting ? "Preparing export…" : "Download user contact list"}</button>
          <span className="text-xs text-slate-500">Includes name, email, and available WhatsApp number only.</span>
        </div>
      </div>
      <form onSubmit={applyFilters} className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-semibold">User search<input aria-label="Search users by name, email, WhatsApp number, or user ID" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, WhatsApp, or ID" maxLength={100} /></label>
        <select className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
          <option value="">All roles</option><option value="user">User</option><option value="helpAdmin">Helpline Admin</option><option value="moderator">Moderator</option>
        </select>
        <select className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="">All account states</option><option value="active">Active</option><option value="disabled">Disabled</option>
        </select>
        <div className="flex gap-2"><select aria-label="Sort users" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select><button disabled={loadingMore} className="rounded-xl bg-forest px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{loadingMore ? "Searching…" : "Filter"}</button>{search && <button type="button" aria-label="Clear user search" onClick={() => setSearch("")} className="rounded-xl border px-3 py-2.5 text-sm">Clear</button>}</div>
      </form>
      {error && <p role="alert" className="mb-4 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="mb-4 text-sm text-emerald-700">{notice}</p>}
      {users.length === 0 ? (
        <p className="text-sm text-slate-500">No user or Helpline Admin accounts found.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {users.map((user) => (
            <li
              key={user.id}
              className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="break-words font-medium">{user.name}</p>
                <p className="mt-1 break-all text-sm text-slate-500">{user.email}</p>
                <p className="mt-1 text-sm text-slate-600">WhatsApp: {user.whatsappPhone || "Not provided"}</p>
                <p className="mt-2 text-xs font-medium text-slate-500">
                  {user.role === "helpAdmin" ? "Helpline Admin" : user.role === "moderator" ? "Moderator" : "User"} ·{" "}
                  {user.suspended ? "Suspended" : user.paymentStatus === "pending" ? "Pending payment" : user.active ? "Active" : "Disabled"} · {user.emailVerified === false ? "Email unverified" : "Email verified"}
                </p>
                <p className="mt-1 text-xs text-slate-500">Wallet: {(user.balanceMinor / 100).toLocaleString("en-PK", { style: "currency", currency: "PKR" })}{user.packageName ? ` · Package: ${user.packageName}` : ""}</p>
                {user.packageActivatedAt && <p className="mt-1 text-xs text-slate-500">Purchased {new Date(user.packageActivatedAt).toLocaleDateString()}</p>}
                {user.packageExpiresAt && <p className={`mt-1 text-xs ${new Date(user.packageExpiresAt) <= new Date() ? "font-semibold text-red-700" : "text-slate-500"}`}>Package {new Date(user.packageExpiresAt) <= new Date() ? "expired" : "expires"} {new Date(user.packageExpiresAt).toLocaleDateString()}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={workingId === user.id}
                  onClick={() => updateUser(user, "toggle")}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
                >
                  {user.suspended ? "Enable" : user.active ? "Disable" : "Enable"}
                </button>
                <button
                  type="button"
                  disabled={workingId === user.id}
                  onClick={() => updateUser(user, "role")}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
                >
                  {user.role === "moderator" ? "Make user" : "Make moderator"}
                </button>
                <button
                  type="button"
                  disabled={workingId === user.id}
                  onClick={() => updateUser(user, "reset")}
                  className="rounded-lg border border-amber-200 px-3 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                >
                  Reset password
                </button>
                <button
                  type="button"
                  disabled={workingId === user.id}
                  onClick={() => updateUser(user, "delete")}
                  className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  Delete
                </button>
                <button
                  type="button"
                  disabled={workingId === user.id}
                  onClick={() => setAdjustingId((current) => current === user.id ? "" : user.id)}
                  className="rounded-lg border border-teal-200 px-3 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 disabled:opacity-50"
                >
                  Adjust wallet
                </button>
                <button
                  type="button"
                  disabled={workingId === user.id}
                  onClick={() => openPackageTools(user)}
                  className="rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-800 hover:bg-indigo-50 disabled:opacity-50"
                >
                  Manage package
                </button>
              </div>
              {packageTargetId === user.id && <form onSubmit={(event) => savePackageChange(user, event)} className="grid w-full gap-3 rounded-xl bg-indigo-50 p-4 sm:grid-cols-[1fr_2fr_auto]">
                <label className="text-xs font-semibold">Action<select className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={packageAction} onChange={(event) => setPackageAction(event.target.value)}><option value="extend">Extend current term</option><option value="assign">Assign / change package</option></select></label>
                {packageAction === "extend"
                  ? <label className="text-xs font-semibold">Additional days<input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" type="number" min="1" max="365" required value={extensionDays} onChange={(event) => setExtensionDays(event.target.value)} /></label>
                  : <label className="text-xs font-semibold">New active package<select className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" required value={selectedPackageId} onChange={(event) => setSelectedPackageId(event.target.value)}><option value="">Select package</option>{packages.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name} · {(item.validityDays || 30)} days · {(item.priceMinor / 100).toLocaleString("en-PK", { style: "currency", currency: "PKR" })}</option>)}</select></label>}
                <button disabled={workingId === user.id} className="self-end rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{workingId === user.id ? "Saving…" : "Save package change"}</button>
              </form>}
              {adjustingId === user.id && <form onSubmit={(event) => adjustBalance(user, event)} className="grid w-full gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-[1fr_1fr_2fr_auto]">
                <label className="text-xs font-semibold">Amount (PKR)<input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" type="number" min="0.01" step="0.01" required value={adjustment.amount} onChange={(event) => setAdjustment({ ...adjustment, amount: event.target.value })} /></label>
                <label className="text-xs font-semibold">Direction<select className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={adjustment.direction} onChange={(event) => setAdjustment({ ...adjustment, direction: event.target.value })}><option value="credit">Credit</option><option value="debit">Debit</option></select></label>
                <label className="text-xs font-semibold">Reason<input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" minLength={3} maxLength={240} required value={adjustment.reason} onChange={(event) => setAdjustment({ ...adjustment, reason: event.target.value })} /></label>
                <button disabled={workingId === user.id} className="self-end rounded-lg bg-forest px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{workingId === user.id ? "Saving…" : "Record adjustment"}</button>
              </form>}
            </li>
          ))}
        </ul>
      )}
      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-3 font-semibold text-forest hover:bg-mint/40"
        >
          {loadingMore ? "Loading…" : "Load more accounts"}
        </button>
      )}
    </section>
  );
}
