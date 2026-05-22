ALTER TABLE "analytics_events" DROP CONSTRAINT "chk_analytics_events_event_type";
--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "chk_analytics_events_event_type" CHECK ("event_type" IN ('page_view', 'search_submitted', 'resolve_started', 'resolve_succeeded', 'resolve_failed', 'listen_on_clicked', 'similar_artist_clicked', 'popular_track_clicked', 'upcoming_event_clicked', 'player_started', 'player_paused', 'player_resumed', 'player_completed', 'player_unavailable', 'info_page_clicked', 'help_page_clicked', 'live_example_clicked', 'ui_click'));
