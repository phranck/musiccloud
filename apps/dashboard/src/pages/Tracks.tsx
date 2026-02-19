import { useCallback, useEffect, useReducer, useState } from "react";
import { useAdminSSE } from "@/hooks/useAdminSSE";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useT } from "@/i18n/context";
import { apiGet } from "@/lib/api";

interface TrackListItem {
  id: string;
  title: string;
  artists: string[];
  albumName: string | null;
  isrc: string | null;
  artworkUrl: string | null;
  sourceService: string | null;
  linkCount: number;
  createdAt: number;
}

interface TrackListResponse {
  items: TrackListItem[];
  total: number;
  page: number;
  limit: number;
}

type FetchState =
  | { status: "loading" }
  | { status: "success"; data: TrackListResponse }
  | { status: "error"; message: string };

type Action =
  | { type: "LOADING" }
  | { type: "SUCCESS"; data: TrackListResponse }
  | { type: "ERROR"; message: string }
  | { type: "PREPEND_TRACK"; track: TrackListItem };

function reducer(state: FetchState, action: Action): FetchState {
  switch (action.type) {
    case "LOADING":
      return { status: "loading" };
    case "SUCCESS":
      return { status: "success", data: action.data };
    case "ERROR":
      return { status: "error", message: action.message };
    case "PREPEND_TRACK":
      if (state.status !== "success") return state;
      return {
        status: "success",
        data: {
          ...state.data,
          items: [action.track, ...state.data.items],
          total: state.data.total + 1,
        },
      };
  }
}

const LIMIT = 20;

export function Tracks() {
  const t = useT();
  const [state, dispatch] = useReducer(reducer, { status: "loading" });
  const [page, setPage] = useState(1);
  const [inputValue, setInputValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Live updates: prepend new tracks on page 1 when no search is active
  useAdminSSE(
    useCallback(
      (event) => {
        if (event.type !== "track-added" || page !== 1 || searchQuery !== "") return;
        dispatch({
          type: "PREPEND_TRACK",
          track: event.data as unknown as TrackListItem,
        });
      },
      [page, searchQuery],
    ),
  );

  // Debounce search input: apply after 400 ms of inactivity, reset to page 1
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(inputValue);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [inputValue]);

  useEffect(() => {
    dispatch({ type: "LOADING" });
    apiGet<TrackListResponse>("/api/admin/tracks", {
      page,
      limit: LIMIT,
      q: searchQuery || undefined,
    })
      .then((data) => dispatch({ type: "SUCCESS", data }))
      .catch((err: Error) => dispatch({ type: "ERROR", message: err.message }));
  }, [page, searchQuery]);

  const totalPages =
    state.status === "success" ? Math.ceil(state.data.total / LIMIT) : 0;

  function formatDate(ts: number): string {
    return new Date(ts).toLocaleDateString(undefined, { dateStyle: "medium" });
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <Input
          placeholder={t("tracks.search")}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="max-w-sm"
        />
        {state.status === "success" && (
          <span className="text-sm text-muted-foreground">
            {state.data.total} {t("tracks.total")}
          </span>
        )}
      </div>

      {state.status === "loading" && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {state.status === "error" && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}

      {state.status === "success" && (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10" />
                  <TableHead>{t("tracks.title")}</TableHead>
                  <TableHead>{t("tracks.artists")}</TableHead>
                  <TableHead>{t("tracks.source")}</TableHead>
                  <TableHead>ISRC</TableHead>
                  <TableHead className="text-center">{t("tracks.links")}</TableHead>
                  <TableHead>{t("tracks.added")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.data.items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-10 text-center text-muted-foreground"
                    >
                      {t("tracks.empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  state.data.items.map((track) => (
                    <TableRow key={track.id}>
                      <TableCell>
                        {track.artworkUrl ? (
                          <img
                            src={track.artworkUrl}
                            alt=""
                            width={36}
                            height={36}
                            className="rounded object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="h-9 w-9 rounded bg-muted" />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium leading-tight">{track.title}</div>
                        {track.albumName && (
                          <div className="text-xs text-muted-foreground">
                            {track.albumName}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {track.artists.join(", ")}
                      </TableCell>
                      <TableCell>
                        {track.sourceService && (
                          <Badge variant="secondary" className="text-xs capitalize">
                            {track.sourceService}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {track.isrc ?? ""}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">{track.linkCount}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(track.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                {t("pagination.previous")}
              </Button>
              <span className="text-sm text-muted-foreground">
                {t("pagination.pageOf", {
                  page: String(page),
                  total: String(totalPages),
                })}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                {t("pagination.next")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
