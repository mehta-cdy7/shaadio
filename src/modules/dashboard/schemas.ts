/**
 * Response shape of `GET /api/dashboard` (API_DESIGN §11). Client-safe. Upcoming events and tasks
 * carry only the fields the dashboard shows; the full Event and Task types arrive with their
 * modules (slices 3 and M3).
 */

export type DashboardEvent = {
  id: string;
  name: string;
  date: string;
  startTime?: string;
  venue?: { name?: string; address?: string };
  headcount: { households: number; people: number };
};

export type DashboardTask = {
  id: string;
  title: string;
  dueDate?: string;
  assignee?: { userId: string; name: string };
  status: 'TODO' | 'IN_PROGRESS' | 'DONE';
};

export type DashboardResponse = {
  daysToGo: number;
  events: { count: number; upcoming: DashboardEvent[] };
  tasks: { done: number; total: number; upcoming: DashboardTask[] };
  guests: {
    invitations: number;
    peopleInvited: number;
    attending: number;
    notAttending: number;
    pending: number;
    peopleAttending: number;
    respondedViaLink: number;
    notInvitedToAnyEvent: number;
  };
  expenses: { totalPaise: number };
  vendors: { count: number };
};
