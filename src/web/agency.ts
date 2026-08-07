/**
 * Everything about the agency that the client facing pages need.
 *
 * Kept in one place because it is the first thing that has to change per
 * agency once this is used by anyone other than Mike, and because none of it
 * belongs hard coded in a page template.
 *
 * The calendar and video are deliberately null until real ones exist. A page
 * that renders a placeholder booking widget to a real client is worse than one
 * that renders nothing: it invites them to book a meeting that will not happen.
 */

export interface AgencyConfig {
  /** The agent the client is dealing with, as they know them. */
  agentName: string;
  agencyName: string;
  /** Shown when a client needs to reach a person rather than a form. */
  phone: string | null;
  email: string | null;

  /**
   * Embeddable scheduling URL. Calendly, Google appointment schedules, Acuity
   * and HubSpot Meetings all expose one. Must be the embed URL rather than the
   * public booking page, or the provider will refuse to render in a frame.
   */
  calendarEmbedUrl: string | null;

  /**
   * A welcome video from the agency. Either an embed URL from a host, or a
   * file served from this site.
   */
  video: {
    kind: "embed" | "file";
    url: string;
    /** Shown by the player before playback and read by screen readers. */
    poster?: string;
    caption?: string;
  } | null;

  /**
   * While true, unfilled slots render as worked examples rather than empty
   * boxes, so the page can be judged on how it will actually look. Everything
   * shown that way is labelled as a sample. Set false before any real client
   * sees the page.
   */
  draft: boolean;
}

export const AGENCY: AgencyConfig = {
  agentName: "Mike Kachur",
  agencyName: "Kachur Agency",
  phone: null,
  email: null,
  calendarEmbedUrl: null,
  video: null,
  draft: true,
};
