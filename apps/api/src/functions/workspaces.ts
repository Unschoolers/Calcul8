import { app } from "@azure/functions";
import { workspacesCreate, workspacesMe, workspaceMembersList, workspaceMembersAdd, workspaceMembers, workspaceMembersRemove, workspaceLeave, workspaceJoinLinksList, workspaceJoinLinksCreate, workspaceJoinLinks, workspaceJoinLinksRemove, joinAccept } from "../features/workspaces/handlers";

export { workspacesCreate, workspacesMe, workspaceMembersList, workspaceMembersAdd, workspaceMembers, workspaceMembersRemove, workspaceLeave, workspaceJoinLinksList, workspaceJoinLinksCreate, workspaceJoinLinks, workspaceJoinLinksRemove, joinAccept } from "../features/workspaces/handlers";

app.http("workspacesCreate", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "workspaces",
  handler: workspacesCreate
});

app.http("workspacesMe", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "workspaces/me",
  handler: workspacesMe
});

app.http("workspaceMembers", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "workspaces/{workspaceId}/members",
  handler: workspaceMembers
});

app.http("workspaceMembersRemove", {
  methods: ["DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "workspaces/{workspaceId}/members/{memberUserId}",
  handler: workspaceMembersRemove
});

app.http("workspaceLeave", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "workspaces/{workspaceId}/leave",
  handler: workspaceLeave
});

app.http("workspaceJoinLinks", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "workspaces/{workspaceId}/join-links",
  handler: workspaceJoinLinks
});

app.http("workspaceJoinLinksRemove", {
  methods: ["DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "workspaces/{workspaceId}/join-links/{inviteId}",
  handler: workspaceJoinLinksRemove
});

app.http("joinAccept", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "join/accept",
  handler: joinAccept
});
