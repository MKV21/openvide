/**
 * Host management via localStorage.
 * Non-sensitive host metadata is stored in localStorage.
 * Host auth tokens are encrypted separately before persistence.
 */

import type { Host } from '../state/types';
import type { Store } from '../state/store';
import { loadHosts, loadHostsSnapshot, persistHosts } from '../lib/host-storage';

/** Load hosts from localStorage and dispatch to store. */
export function fetchHosts(store: Store): void {
  store.dispatch({ type: 'HOSTS_LOADED', hosts: loadHostsSnapshot() as Host[] });
  void (async () => {
    const hosts = await loadHosts() as Host[];
    store.dispatch({ type: 'HOSTS_LOADED', hosts });
  })();
}

/** Add a host and persist to localStorage. */
export function addHost(store: Store, name: string, url: string): boolean {
  const hosts = loadHostsSnapshot() as Host[];
  const host: Host = {
    id: crypto.randomUUID(),
    name,
    url: url.replace(/\/$/, ''),
  };
  hosts.push(host);
  void persistHosts(hosts);
  store.dispatch({ type: 'HOST_ADD', host });
  return true;
}

/** Remove a host and persist to localStorage. */
export function removeHost(store: Store, hostId: string): boolean {
  const hosts = (loadHostsSnapshot() as Host[]).filter((h) => h.id !== hostId);
  void persistHosts(hosts);
  store.dispatch({ type: 'HOST_REMOVE', hostId });
  return true;
}
