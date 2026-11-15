// frontend/src/components/AddMembersModal.jsx
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, X, Check, UserPlus } from "lucide-react";
import toast from "react-hot-toast";
import { searchUsers, addGroupMembers, getUserFriends } from "../lib/api";

export default function AddMembersModal({ groupId, groupName, existingMemberIds = [], onClose }) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState({}); // id -> user

  const existing = useMemo(() => new Set(existingMemberIds.map(String)), [existingMemberIds]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const { data: friends = [], isLoading: friendsLoading } = useQuery({
    queryKey: ["friends"],
    queryFn: getUserFriends,
  });

  const { data: searchResults = [], isFetching: searching } = useQuery({
    queryKey: ["userSearch", debounced],
    queryFn: () => searchUsers(debounced),
    enabled: debounced.length >= 2,
  });

  const searchingMode = debounced.length >= 2;
  const candidates = (searchingMode ? searchResults : friends).filter((u) => !existing.has(String(u._id)));
  const selectedList = Object.values(selected);

  const toggle = (user) =>
    setSelected((prev) => {
      const next = { ...prev };
      if (next[user._id]) delete next[user._id];
      else next[user._id] = user;
      return next;
    });

  const { mutate: addMembers, isPending } = useMutation({
    mutationFn: () => addGroupMembers(groupId, selectedList.map((m) => m._id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      toast.success(`${selectedList.length} member${selectedList.length > 1 ? "s" : ""} added`);
      onClose();
    },
    onError: (err) => toast.error(err?.response?.data?.message || "Failed to add members"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full sm:max-w-md max-h-[85vh] flex flex-col bg-base-100 rounded-t-3xl sm:rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-5 pb-3">
          <div>
            <h3 className="font-bold text-lg">Add members</h3>
            <p className="text-sm opacity-60 truncate">to {groupName}</p>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm btn-circle" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>

        <div className="px-5">
          <label className="input input-bordered flex items-center gap-2">
            <Search className="size-4 opacity-50" />
            <input
              autoFocus
              type="text"
              className="grow"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email"
            />
            {searching && <span className="loading loading-spinner loading-xs" />}
          </label>
        </div>

        {selectedList.length > 0 && (
          <div className="flex gap-3 overflow-x-auto px-5 pt-4 pb-1">
            {selectedList.map((u) => (
              <button key={u._id} onClick={() => toggle(u)} className="flex flex-col items-center gap-1 shrink-0 w-14">
                <div className="relative">
                  <img src={u.profilePicture} alt="" className="size-12 rounded-full object-cover bg-base-300" />
                  <span className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-base-300 ring-2 ring-base-100">
                    <X className="size-3" />
                  </span>
                </div>
                <span className="text-[11px] truncate w-full text-center">{u.fullName?.split(" ")[0]}</span>
              </button>
            ))}
          </div>
        )}

        <p className="px-5 pt-4 pb-2 text-xs font-semibold uppercase tracking-wide opacity-50">
          {searchingMode ? "Search results" : "Your friends"}
        </p>

        <ul className="flex-1 overflow-y-auto px-2 min-h-[8rem]">
          {(friendsLoading && !searchingMode) ? (
            <li className="flex justify-center py-8"><span className="loading loading-spinner" /></li>
          ) : candidates.length === 0 ? (
            <li className="py-8 text-center text-sm opacity-60">
              {searchingMode
                ? "No one found (or they're already in the group)"
                : query.trim().length === 1
                  ? "Type at least 2 characters"
                  : "All your friends are already here. Search for others above."}
            </li>
          ) : (
            candidates.map((u) => {
              const isSelected = Boolean(selected[u._id]);
              return (
                <li key={u._id}>
                  <button
                    onClick={() => toggle(u)}
                    className={`w-full flex items-center gap-3 rounded-xl p-3 text-left transition ${
                      isSelected ? "bg-primary/10" : "hover:bg-base-200"
                    }`}
                  >
                    <img src={u.profilePicture} alt="" className="size-10 rounded-full object-cover bg-base-300" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{u.fullName}</p>
                      {u.email && <p className="text-xs opacity-60 truncate">{u.email}</p>}
                    </div>
                    <span
                      className={`grid size-6 place-items-center rounded-full border-2 transition ${
                        isSelected ? "bg-primary border-primary text-primary-content" : "border-base-300"
                      }`}
                    >
                      {isSelected && <Check className="size-3.5" />}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <div className="p-5 pt-3 border-t border-base-200">
          <button
            className="btn btn-primary w-full gap-2"
            onClick={() => addMembers()}
            disabled={selectedList.length === 0 || isPending}
          >
            {isPending ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              <UserPlus className="size-4" />
            )}
            {selectedList.length ? `Add ${selectedList.length} member${selectedList.length > 1 ? "s" : ""}` : "Select people to add"}
          </button>
        </div>
      </div>
    </div>
  );
}
