import { DrawerShell } from 'even-toolkit/web';
import type { SideDrawerItem } from 'even-toolkit/web';
import { useLocation } from 'react-router';
import {
  IcMenuHome,
  IcEditChecklist,
  IcFeatAccount,
  IcStatusDisconnected,
  IcFeatTimeCounting,
  IcEditSettings,
  IcStatusFile,
  IcFeatLearnExplore,
} from 'even-toolkit/web/icons/svg-icons';

const iconProps = { width: 18, height: 18, className: 'text-current' };

const MENU_ITEMS: SideDrawerItem[] = [
  { id: '/', label: 'Workspaces', section: 'Navigation', icon: <IcMenuHome {...iconProps} /> },
  { id: '/sessions', label: 'Sessions', section: 'Navigation', icon: <IcEditChecklist {...iconProps} /> },
  { id: '/teams', label: 'Teams', section: 'Navigation', icon: <IcFeatAccount {...iconProps} /> },
  { id: '/hosts', label: 'Hosts', section: 'Navigation', icon: <IcStatusDisconnected {...iconProps} /> },
  { id: '/schedules', label: 'Schedules', section: 'Tools', icon: <IcFeatTimeCounting {...iconProps} /> },
  { id: '/files?source=drawer', label: 'Files', section: 'Tools', icon: <IcStatusFile {...iconProps} /> },
];

const BOTTOM_ITEMS: SideDrawerItem[] = [
  { id: '/guide', label: 'Guide', icon: <IcFeatLearnExplore {...iconProps} /> },
  { id: '/settings', label: 'Settings', icon: <IcEditSettings {...iconProps} /> },
];

function getPageTitle(pathname: string): string {
  if (pathname === '/') return 'OpenVide';
  if (pathname.startsWith('/workspace')) return 'Workspace';
  if (pathname.startsWith('/sessions')) return 'Sessions';
  if (pathname.startsWith('/team-chat')) return 'Team Chat';
  if (pathname.startsWith('/teams')) return 'Teams';
  if (pathname.startsWith('/team')) return 'Team';
  if (pathname.startsWith('/hosts')) return 'Hosts';
  if (pathname.startsWith('/host')) return 'Host';
  if (pathname.startsWith('/chat')) return 'Chat';
  if (pathname.startsWith('/settings')) return 'Settings';
  if (pathname.startsWith('/guide')) return 'Guide';
  if (pathname.startsWith('/schedules')) return 'Schedules';
  if (pathname.startsWith('/files')) return 'Files';
  if (pathname.startsWith('/diffs')) return 'Diffs';
  if (pathname.startsWith('/ports')) return 'Ports';
  if (pathname.startsWith('/prompts')) return 'Prompts';
  return 'OpenVide';
}

function deriveActiveId(pathname: string): string {
  if (pathname === '/' || pathname.startsWith('/workspace')) return '/';
  if (pathname.startsWith('/sessions') || pathname.startsWith('/chat')) return '/sessions';
  if (pathname.startsWith('/teams') || pathname.startsWith('/team')) return '/teams';
  if (pathname.startsWith('/hosts') || pathname.startsWith('/host')) return '/hosts';
  if (pathname.startsWith('/schedules')) return '/schedules';
  if (pathname.startsWith('/files')) return '/files';
  if (pathname.startsWith('/guide')) return '/guide';
  if (pathname.startsWith('/settings')) return '/settings';
  return '/';
}

export function Shell() {
  const location = useLocation();
  const activeId = deriveActiveId(location.pathname);
  const pageTitlePrefix = [...MENU_ITEMS, ...BOTTOM_ITEMS].find((item) => item.id === activeId)?.icon;

  return (
    <DrawerShell
      items={MENU_ITEMS}
      bottomItems={BOTTOM_ITEMS}
      title="OpenVide"
      getPageTitle={getPageTitle}
      deriveActiveId={deriveActiveId}
      pageTitlePrefix={pageTitlePrefix}
      className="openvide-shell"
    />
  );
}
