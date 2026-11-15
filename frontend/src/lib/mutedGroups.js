// Per-device list of muted groups. Muting silences notifications only;
// messages still arrive in the group itself.
const KEY = "muted-groups";

const read = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
};

export const isGroupMuted = (groupId) => read().includes(String(groupId));

export const setGroupMuted = (groupId, muted) => {
  try {
    const set = new Set(read());
    if (muted) set.add(String(groupId));
    else set.delete(String(groupId));
    localStorage.setItem(KEY, JSON.stringify([...set]));
  } catch {
    /* storage unavailable */
  }
};
