"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { getOrganizerNote, saveOrganizerNote } from "@/lib/admin/tournaments";
export function OrganizerNotes({ tournamentId }: { tournamentId: string }) { const [content, setContent] = useState(""); const note = useQuery({ queryKey: ["organizer-note", tournamentId], queryFn: () => getOrganizerNote(tournamentId) }); useEffect(() => { if (note.data !== undefined) setContent(note.data); }, [note.data]); const save = useMutation({ mutationFn: () => saveOrganizerNote(tournamentId, content), onSuccess: () => toast.success("Notes saved"), onError: (error: Error) => toast.error(error.message.replaceAll("_", " ")) }); return <div><textarea className="input-field min-h-32 w-full" placeholder="Private organizer notes" value={content} onChange={(event) => setContent(event.target.value)} /><button className="btn-primary mt-3 px-3 py-2 text-sm" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save notes"}</button></div>; }
