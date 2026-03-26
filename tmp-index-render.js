(function(){
const _Vue = Vue

return function render(_ctx, _cache) {
  with (_ctx) {
    const { createElementVNode: _createElementVNode, toDisplayString: _toDisplayString, createTextVNode: _createTextVNode, resolveComponent: _resolveComponent, withCtx: _withCtx, createVNode: _createVNode, normalizeClass: _normalizeClass, openBlock: _openBlock, createBlock: _createBlock, createCommentVNode: _createCommentVNode, createElementBlock: _createElementBlock, mergeProps: _mergeProps, renderList: _renderList, Fragment: _Fragment, normalizeStyle: _normalizeStyle, withKeys: _withKeys, createSlots: _createSlots, withModifiers: _withModifiers } = _Vue

    const _component_v_icon = _resolveComponent("v-icon")
    const _component_v_app_bar_title = _resolveComponent("v-app-bar-title")
    const _component_v_avatar = _resolveComponent("v-avatar")
    const _component_v_btn = _resolveComponent("v-btn")
    const _component_v_divider = _resolveComponent("v-divider")
    const _component_v_list_subheader = _resolveComponent("v-list-subheader")
    const _component_v_list_item = _resolveComponent("v-list-item")
    const _component_v_list = _resolveComponent("v-list")
    const _component_v_menu = _resolveComponent("v-menu")
    const _component_v_app_bar = _resolveComponent("v-app-bar")
    const _component_v_alert = _resolveComponent("v-alert")
    const _component_v_list_item_title = _resolveComponent("v-list-item-title")
    const _component_v_list_item_subtitle = _resolveComponent("v-list-item-subtitle")
    const _component_v_select = _resolveComponent("v-select")
    const _component_v_col = _resolveComponent("v-col")
    const _component_v_row = _resolveComponent("v-row")
    const _component_v_card_text = _resolveComponent("v-card-text")
    const _component_v_card = _resolveComponent("v-card")
    const _component_singles_config_window = _resolveComponent("singles-config-window")
    const _component_config_window = _resolveComponent("config-window")
    const _component_v_window_item = _resolveComponent("v-window-item")
    const _component_live_window = _resolveComponent("live-window")
    const _component_sales_window = _resolveComponent("sales-window")
    const _component_portfolio_window = _resolveComponent("portfolio-window")
    const _component_wheel_window = _resolveComponent("wheel-window")
    const _component_v_window = _resolveComponent("v-window")
    const _component_v_container = _resolveComponent("v-container")
    const _component_v_bottom_navigation = _resolveComponent("v-bottom-navigation")
    const _component_v_main = _resolveComponent("v-main")
    const _component_v_fab = _resolveComponent("v-fab")
    const _component_v_speed_dial = _resolveComponent("v-speed-dial")
    const _component_v_card_title = _resolveComponent("v-card-title")
    const _component_v_text_field = _resolveComponent("v-text-field")
    const _component_v_spacer = _resolveComponent("v-spacer")
    const _component_v_card_actions = _resolveComponent("v-card-actions")
    const _component_v_dialog = _resolveComponent("v-dialog")
    const _component_v_skeleton_loader = _resolveComponent("v-skeleton-loader")
    const _component_v_chip = _resolveComponent("v-chip")
    const _component_v_checkbox = _resolveComponent("v-checkbox")
    const _component_v_btn_toggle = _resolveComponent("v-btn-toggle")
    const _component_auto_calculate_modal = _resolveComponent("auto-calculate-modal")
    const _component_v_autocomplete = _resolveComponent("v-autocomplete")
    const _component_whatnot_csv_import_dialog = _resolveComponent("whatnot-csv-import-dialog")
    const _component_whatnot_review_dialog = _resolveComponent("whatnot-review-dialog")
    const _component_v_snackbar = _resolveComponent("v-snackbar")
    const _component_v_app = _resolveComponent("v-app")

    return (_openBlock(), _createElementBlock("div", { id: "app" }, [
      _createVNode(_component_v_app, null, {
        default: _withCtx(() => [
          isGoogleSignedIn
            ? (_openBlock(), _createElementBlock(_Fragment, { key: 0 }, [
                _createVNode(_component_v_app_bar, {
                  density: "compact",
                  flat: "",
                  border: ""
                }, {
                  append: _withCtx(() => [
                    _createVNode(_component_v_menu, {
                      location: "bottom end",
                      offset: "10",
                      transition: false
                    }, {
                      activator: _withCtx(({ props: accountMenuProps }) => [
                        _createVNode(_component_v_btn, _mergeProps(accountMenuProps, {
                          icon: "",
                          variant: "text",
                          size: "default",
                          class: "account-menu-activator",
                          title: googleProfileEmail ? `Signed in as ${googleProfileEmail}` : 'Signed in',
                          "aria-label": "Account menu"
                        }), {
                          default: _withCtx(() => [
                            (googleProfilePicture && !googleAvatarLoadFailed)
                              ? (_openBlock(), _createBlock(_component_v_avatar, {
                                  key: 0,
                                  size: "28"
                                }, {
                                  default: _withCtx(() => [
                                    _createElementVNode("img", {
                                      src: googleProfilePicture,
                                      alt: googleProfileName || 'Google profile picture',
                                      class: "account-avatar-img",
                                      referrerpolicy: "no-referrer",
                                      onError: $event => (googleAvatarLoadFailed = true),
                                      onLoad: $event => (googleAvatarLoadFailed = false)
                                    }, null, 40 /* PROPS, NEED_HYDRATION */, ["src", "alt", "onError", "onLoad"])
                                  ]),
                                  _: 2 /* DYNAMIC */
                                }, 1024 /* DYNAMIC_SLOTS */))
                              : (_openBlock(), _createBlock(_component_v_icon, {
                                  key: 1,
                                  size: "26"
                                }, {
                                  default: _withCtx(() => [
                                    _createTextVNode("mdi-account-circle-outline")
                                  ]),
                                  _: 2 /* DYNAMIC */
                                }, 1024 /* DYNAMIC_SLOTS */)),
                            ((isWorkspaceScopeActive && workspaceRealtimeStatus !== 'idle') || (!isWorkspaceScopeActive && syncStatus !== 'idle'))
                              ? (_openBlock(), _createElementBlock("span", {
                                  key: 2,
                                  class: _normalizeClass(["account-menu-sync-badge", [
                    isWorkspaceScopeActive
                      ? (workspaceRealtimeStatus === 'connected'
                        ? 'account-menu-sync-badge--success'
                        : (workspaceRealtimeStatus === 'disconnected'
                          ? 'account-menu-sync-badge--error'
                          : 'account-menu-sync-badge--syncing'))
                      : (syncStatus === 'syncing'
                      ? 'account-menu-sync-badge--syncing'
                      : (syncStatus === 'success'
                        ? 'account-menu-sync-badge--success'
                        : 'account-menu-sync-badge--error'))
                  ]]),
                                  "aria-hidden": "true"
                                }, [
                                  _createVNode(_component_v_icon, {
                                    size: (isWorkspaceScopeActive && (workspaceRealtimeStatus === 'connecting' || workspaceRealtimeStatus === 'reconnecting'))
                      || (!isWorkspaceScopeActive && syncStatus === 'syncing')
                      ? 10
                      : 11,
                                    class: _normalizeClass((isWorkspaceScopeActive && (workspaceRealtimeStatus === 'connecting' || workspaceRealtimeStatus === 'reconnecting'))
                      || (!isWorkspaceScopeActive && syncStatus === 'syncing')
                      ? 'sync-spinning'
                      : '')
                                  }, {
                                    default: _withCtx(() => [
                                      _createTextVNode(_toDisplayString(isWorkspaceScopeActive
                      ? ((workspaceRealtimeStatus === 'connecting' || workspaceRealtimeStatus === 'reconnecting')
                      ? 'mdi-sync'
                      : (workspaceRealtimeStatus === 'connected' ? 'mdi-check-bold' : 'mdi-alert'))
                      : (syncStatus === 'syncing'
                      ? 'mdi-sync'
                      : (syncStatus === 'success' ? 'mdi-check-bold' : 'mdi-alert'))), 1 /* TEXT */)
                                    ]),
                                    _: 2 /* DYNAMIC */
                                  }, 1032 /* PROPS, DYNAMIC_SLOTS */, ["size", "class"])
                                ], 2 /* CLASS */))
                              : _createCommentVNode("v-if", true)
                          ]),
                          _: 2 /* DYNAMIC */
                        }, 1040 /* FULL_PROPS, DYNAMIC_SLOTS */, ["title"])
                      ]),
                      default: _withCtx(() => [
                        _createVNode(_component_v_list, {
                          "min-width": "320",
                          class: "account-menu-list"
                        }, {
                          default: _withCtx(() => [
                            _createElementVNode("div", { class: "account-menu-header" }, [
                              _createVNode(_component_v_avatar, {
                                size: "42",
                                class: "account-menu-header__avatar"
                              }, {
                                default: _withCtx(() => [
                                  (googleProfilePicture && !googleAvatarLoadFailed)
                                    ? (_openBlock(), _createElementBlock("img", {
                                        key: 0,
                                        src: googleProfilePicture,
                                        alt: googleProfileName || 'Google profile picture',
                                        class: "account-avatar-img",
                                        referrerpolicy: "no-referrer"
                                      }, null, 8 /* PROPS */, ["src", "alt"]))
                                    : (_openBlock(), _createElementBlock("span", {
                                        key: 1,
                                        class: "account-menu-header__initial"
                                      }, _toDisplayString((googleProfileName || googleProfileEmail || '?').slice(0, 1).toUpperCase()), 1 /* TEXT */))
                                ]),
                                _: 1 /* STABLE */
                              }),
                              _createElementVNode("div", { class: "account-menu-header__copy" }, [
                                _createElementVNode("div", { class: "account-menu-header__name" }, _toDisplayString(googleProfileName || 'Google account'), 1 /* TEXT */),
                                _createElementVNode("div", { class: "account-menu-header__email" }, _toDisplayString(googleProfileEmail || 'Signed in'), 1 /* TEXT */),
                                _createElementVNode("div", { class: "account-menu-header__workspace" }, [
                                  _createElementVNode("span", { class: "account-menu-header__workspace-name" }, _toDisplayString(currentWorkspaceName), 1 /* TEXT */)
                                ])
                              ])
                            ]),
                            _createVNode(_component_v_divider, { class: "my-1" }),
                            _createVNode(_component_v_list_subheader, null, {
                              default: _withCtx(() => [
                                _createTextVNode("Workspace")
                              ]),
                              _: 1 /* STABLE */
                            }),
                            _createVNode(_component_v_list_item, {
                              title: "Personal",
                              "prepend-icon": "mdi-home-account",
                              active: activeScopeType === 'personal',
                              onClick: switchToPersonalWorkspace
                            }, null, 8 /* PROPS */, ["active", "onClick"]),
                            (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(availableWorkspaces, (workspace) => {
                              return (_openBlock(), _createBlock(_component_v_list_item, {
                                key: workspace.workspaceId,
                                subtitle: workspace.role === 'owner' ? 'Owner' : 'Member',
                                "prepend-icon": "mdi-account-multiple-outline",
                                active: activeWorkspaceId === workspace.workspaceId,
                                onClick: $event => (switchToWorkspace(workspace.workspaceId))
                              }, {
                                title: _withCtx(() => [
                                  _createElementVNode("span", { class: "workspace-menu-item-title" }, [
                                    _createElementVNode("span", { class: "workspace-menu-item-title__name" }, _toDisplayString(workspace.name), 1 /* TEXT */),
                                    (activeWorkspaceId === workspace.workspaceId && activeWorkspaceVisibleMembers.length)
                                      ? (_openBlock(), _createElementBlock("span", {
                                          key: 0,
                                          class: "workspace-avatar-stack",
                                          "aria-hidden": "true"
                                        }, [
                                          (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(activeWorkspaceVisibleMembers, (member) => {
                                            return (_openBlock(), _createElementBlock("span", {
                                              key: `${workspace.workspaceId}:${member.userId}`,
                                              class: "workspace-avatar-stack__item"
                                            }, [
                                              _createVNode(_component_v_avatar, {
                                                size: "24",
                                                class: "workspace-avatar-stack__avatar"
                                              }, {
                                                default: _withCtx(() => [
                                                  (member.photoUrl)
                                                    ? (_openBlock(), _createElementBlock("img", {
                                                        key: 0,
                                                        src: member.photoUrl,
                                                        alt: member.displayName || 'Workspace member avatar',
                                                        class: "account-avatar-img",
                                                        referrerpolicy: "no-referrer"
                                                      }, null, 8 /* PROPS */, ["src", "alt"]))
                                                    : (_openBlock(), _createElementBlock("span", {
                                                        key: 1,
                                                        class: "workspace-avatar-stack__initial"
                                                      }, _toDisplayString((member.displayName || '?').slice(0, 1).toUpperCase()), 1 /* TEXT */))
                                                ]),
                                                _: 2 /* DYNAMIC */
                                              }, 1024 /* DYNAMIC_SLOTS */),
                                              _createElementVNode("span", {
                                                class: _normalizeClass(["workspace-avatar-stack__presence", `workspace-avatar-stack__presence--${getWorkspaceMemberPresenceState(member)}`]),
                                                title: getWorkspaceMemberPresenceLabel(member)
                                              }, null, 10 /* CLASS, PROPS */, ["title"])
                                            ]))
                                          }), 128 /* KEYED_FRAGMENT */)),
                                          (activeWorkspaceOverflowMemberCount > 0)
                                            ? (_openBlock(), _createElementBlock("span", {
                                                key: 0,
                                                class: "workspace-avatar-stack__overflow"
                                              }, " +" + _toDisplayString(activeWorkspaceOverflowMemberCount), 1 /* TEXT */))
                                            : _createCommentVNode("v-if", true)
                                        ]))
                                      : _createCommentVNode("v-if", true)
                                  ])
                                ]),
                                _: 2 /* DYNAMIC */
                              }, 1032 /* PROPS, DYNAMIC_SLOTS */, ["subtitle", "active", "onClick"]))
                            }), 128 /* KEYED_FRAGMENT */)),
                            (activeScopeType === 'personal')
                              ? (_openBlock(), _createBlock(_component_v_list_item, {
                                  key: 0,
                                  title: "Create shared workspace",
                                  "prepend-icon": "mdi-plus-circle-outline",
                                  onClick: $event => (showCreateWorkspaceModal = true)
                                }, null, 8 /* PROPS */, ["onClick"]))
                              : _createCommentVNode("v-if", true),
                            isWorkspaceScopeActive
                              ? (_openBlock(), _createBlock(_component_v_list_item, {
                                  key: 1,
                                  title: "Workspace",
                                  "prepend-icon": "mdi-account-cog-outline",
                                  onClick: openWorkspaceMembersModal
                                }, null, 8 /* PROPS */, ["onClick"]))
                              : _createCommentVNode("v-if", true),
                            _createVNode(_component_v_divider, { class: "my-1" }),
                            _createVNode(_component_v_list_subheader, null, {
                              default: _withCtx(() => [
                                _createTextVNode("App")
                              ]),
                              _: 1 /* STABLE */
                            }),
                            showInstallPrompt
                              ? (_openBlock(), _createBlock(_component_v_list_item, {
                                  key: 2,
                                  title: "Install app",
                                  "prepend-icon": "mdi-download",
                                  onClick: promptInstall
                                }, null, 8 /* PROPS */, ["onClick"]))
                              : _createCommentVNode("v-if", true),
                            _createVNode(_component_v_list_item, {
                              title: "Import Whatnot CSV",
                              subtitle: "Map and review Whatnot sales before importing",
                              "prepend-icon": "mdi-file-delimited-outline",
                              onClick: openWhatnotCsvImportDialog
                            }, null, 8 /* PROPS */, ["onClick"]),
                            ((whatnotConnectionSummary?.pendingReviewCount ?? 0) > 0 || whatnotReviewBatchId)
                              ? (_openBlock(), _createBlock(_component_v_list_item, {
                                  key: 3,
                                  title: whatnotConnectionSummary?.pendingReviewCount
                  ? `Review Whatnot imports (${whatnotConnectionSummary.pendingReviewCount})`
                  : 'Review Whatnot imports',
                                  subtitle: "Finish reviewing staged Whatnot rows",
                                  "prepend-icon": "mdi-table-eye",
                                  onClick: openWhatnotReviewDialog
                                }, null, 8 /* PROPS */, ["title", "onClick"]))
                              : _createCommentVNode("v-if", true),
                            isWorkspaceScopeActive
                              ? (_openBlock(), _createBlock(_component_v_list_item, {
                                  key: 4,
                                  title: workspaceRealtimeStatus === 'connected'
                  ? 'Workspace realtime connected'
                  : (workspaceRealtimeStatus === 'connecting'
                    ? 'Workspace realtime connecting'
                    : (workspaceRealtimeStatus === 'reconnecting'
                      ? 'Workspace realtime reconnecting'
                      : (workspaceRealtimeStatus === 'disconnected'
                        ? 'Workspace realtime disconnected'
                        : 'Workspace realtime idle'))),
                                  subtitle: workspaceRealtimeStatus === 'connected'
                  ? 'Live workspace updates are active'
                  : (workspaceRealtimeStatus === 'connecting'
                    ? 'Opening realtime connection'
                    : (workspaceRealtimeStatus === 'reconnecting'
                      ? 'Retrying with backoff'
                      : (workspaceRealtimeStatus === 'disconnected'
                        ? 'Last realtime attempt failed'
                        : 'Realtime not active for this view'))),
                                  "prepend-icon": workspaceRealtimeStatus === 'connected'
                  ? 'mdi-lan-connect'
                  : ((workspaceRealtimeStatus === 'connecting' || workspaceRealtimeStatus === 'reconnecting')
                    ? 'mdi-sync'
                    : 'mdi-lan-disconnect')
                                }, null, 8 /* PROPS */, ["title", "subtitle", "prepend-icon"]))
                              : _createCommentVNode("v-if", true),
                            _createVNode(_component_v_list_item, {
                              title: syncStatus === 'syncing'
                  ? 'Syncing'
                  : (syncStatus === 'success'
                    ? 'Re-check Pro access'
                    : (syncStatus === 'error'
                      ? 'Review sync status'
                      : 'Check sync status')),
                              subtitle: syncStatus === 'syncing'
                  ? 'Cloud sync in progress'
                  : (syncStatus === 'success'
                    ? 'Synced successfully'
                    : (syncStatus === 'error'
                      ? 'Last sync needs attention'
                      : '')),
                              "prepend-icon": syncStatus === 'syncing'
                  ? 'mdi-sync'
                  : (syncStatus === 'success'
                    ? 'mdi-check-circle-outline'
                    : (syncStatus === 'error'
                      ? 'mdi-alert-circle-outline'
                      : 'mdi-sync')),
                              onClick: $event => (debugLogEntitlement(true))
                            }, null, 8 /* PROPS */, ["title", "subtitle", "prepend-icon", "onClick"]),
                            _createVNode(_component_v_list_item, {
                              title: isDark ? 'Switch to light mode' : 'Switch to dark mode',
                              "prepend-icon": isDark ? 'mdi-weather-sunny' : 'mdi-weather-night',
                              onClick: toggleTheme
                            }, null, 8 /* PROPS */, ["title", "prepend-icon", "onClick"]),
                            (whatnotConnectionStatus !== 'unconfigured')
                              ? (_openBlock(), _createElementBlock(_Fragment, { key: 5 }, [
                                  _createVNode(_component_v_divider, { class: "my-1" }),
                                  _createVNode(_component_v_list_subheader, null, {
                                    default: _withCtx(() => [
                                      _createTextVNode("Integrations")
                                    ]),
                                    _: 1 /* STABLE */
                                  }),
                                  _createVNode(_component_v_list_item, {
                                    title: whatnotConnectionStatus === 'connected'
                    ? 'Whatnot connected'
                    : (whatnotConnectionStatus === 'connecting'
                      ? 'Connecting Whatnot'
                      : (whatnotConnectionStatus === 'disconnected'
                        ? 'Whatnot disconnected'
                        : 'Whatnot needs attention')),
                                    subtitle: whatnotConnectionSummary?.connected
                    ? `${whatnotConnectionSummary.displayName || 'Connected seller'}${whatnotConnectionSummary.pendingReviewCount > 0 ? ` • ${whatnotConnectionSummary.pendingReviewCount} pending review` : ''}`
                    : (activeScopeType === 'workspace'
                      ? 'Connect your Whatnot account for this shared workspace'
                      : 'Connect your Whatnot account to import orders into Personal'),
                                    "prepend-icon": whatnotConnectionStatus === 'connected'
                    ? 'mdi-shopping'
                    : ((whatnotConnectionStatus === 'connecting' || whatnotSyncStatus === 'syncing')
                      ? 'mdi-sync'
                      : 'mdi-shopping-outline')
                                  }, null, 8 /* PROPS */, ["title", "subtitle", "prepend-icon"]),
                                  ((activeScopeType === 'personal' || isCurrentWorkspaceOwner) && !whatnotConnectionSummary?.connected)
                                    ? (_openBlock(), _createBlock(_component_v_list_item, {
                                        key: 0,
                                        title: whatnotConnectionStatus === 'connecting' ? 'Connecting Whatnot...' : 'Connect Whatnot',
                                        "prepend-icon": "mdi-connection",
                                        disabled: whatnotConnectionStatus === 'connecting',
                                        onClick: connectWhatnot
                                      }, null, 8 /* PROPS */, ["title", "disabled", "onClick"]))
                                    : _createCommentVNode("v-if", true),
                                  (whatnotConnectionSummary?.connected)
                                    ? (_openBlock(), _createBlock(_component_v_list_item, {
                                        key: 1,
                                        title: whatnotConnectionSummary.pendingReviewCount > 0
                    ? `Review Whatnot imports (${whatnotConnectionSummary.pendingReviewCount})`
                    : 'Review Whatnot imports',
                                        "prepend-icon": "mdi-table-eye",
                                        onClick: openWhatnotReviewDialog
                                      }, null, 8 /* PROPS */, ["title", "onClick"]))
                                    : _createCommentVNode("v-if", true),
                                  (whatnotConnectionSummary?.connected && (activeScopeType === 'personal' || isCurrentWorkspaceOwner))
                                    ? (_openBlock(), _createBlock(_component_v_list_item, {
                                        key: 2,
                                        title: whatnotSyncStatus === 'syncing' ? 'Syncing Whatnot sales...' : 'Sync Whatnot sales',
                                        "prepend-icon": "mdi-refresh",
                                        disabled: whatnotSyncStatus === 'syncing',
                                        onClick: syncWhatnotSales
                                      }, null, 8 /* PROPS */, ["title", "disabled", "onClick"]))
                                    : _createCommentVNode("v-if", true),
                                  (whatnotConnectionSummary?.connected && (activeScopeType === 'personal' || isCurrentWorkspaceOwner))
                                    ? (_openBlock(), _createBlock(_component_v_list_item, {
                                        key: 3,
                                        title: "Disconnect Whatnot",
                                        "prepend-icon": "mdi-link-off",
                                        onClick: disconnectWhatnot
                                      }, null, 8 /* PROPS */, ["onClick"]))
                                    : _createCommentVNode("v-if", true),
                                  _createVNode(_component_v_divider, { class: "my-1" })
                                ], 64 /* STABLE_FRAGMENT */))
                              : _createCommentVNode("v-if", true),
                            _createVNode(_component_v_list_subheader, null, {
                              default: _withCtx(() => [
                                _createTextVNode("Account")
                              ]),
                              _: 1 /* STABLE */
                            }),
                            _createVNode(_component_v_list_item, {
                              title: "Clear my data",
                              subtitle: "Clears your personal cloud data",
                              "prepend-icon": "mdi-delete-alert-outline",
                              onClick: $event => (askConfirmation(
                  {
                    title: 'Clear your personal data?',
                    text: 'This removes your personal cloud data, local app data, and signs you out. Shared workspaces are not deleted.',
                    color: 'error'
                  },
                  () => clearPersonalAccountData()
                ))
                            }, null, 8 /* PROPS */, ["onClick"]),
                            _createVNode(_component_v_list_item, {
                              title: "Sign out",
                              "prepend-icon": "mdi-logout",
                              onClick: logoutCurrentSession
                            }, null, 8 /* PROPS */, ["onClick"])
                          ]),
                          _: 1 /* STABLE */
                        })
                      ]),
                      _: 1 /* STABLE */
                    }, 8 /* PROPS */, ["transition"])
                  ]),
                  default: _withCtx(() => [
                    _createVNode(_component_v_app_bar_title, null, {
                      default: _withCtx(() => [
                        _createElementVNode("div", { class: "app-bar-title-wrap" }, [
                          _createElementVNode("span", {
                            class: "app-bar-brand-lockup",
                            "aria-hidden": "true"
                          }, [
                            _createElementVNode("span", { class: "app-bar-brand-badge" }, [
                              _createElementVNode("img", {
                                src: "icons/icon-192.png",
                                alt: "",
                                class: "app-bar-brand-badge__img"
                              })
                            ]),
                            _createElementVNode("span", { class: "app-bar-brand-copy" }, [
                              _createElementVNode("span", { class: "app-bar-brand-copy__name" }, "whatfees"),
                              _createElementVNode("span", { class: "app-bar-brand-copy__tagline" }, "Track sales like a pro")
                            ])
                          ]),
                          _createElementVNode("span", {
                            class: _normalizeClass(["app-bar-scope-chip", activeScopeType === 'workspace' ? 'app-bar-scope-chip--workspace' : 'app-bar-scope-chip--personal'])
                          }, [
                            _createVNode(_component_v_icon, {
                              size: "13",
                              class: "mr-1"
                            }, {
                              default: _withCtx(() => [
                                _createTextVNode(_toDisplayString(activeScopeType === 'workspace' ? 'mdi-account-group-outline' : 'mdi-home-account'), 1 /* TEXT */)
                              ]),
                              _: 1 /* STABLE */
                            }),
                            _createTextVNode(" " + _toDisplayString(activeScopeType === 'workspace'
                ? currentWorkspaceName
                : 'Personal'), 1 /* TEXT */)
                          ], 2 /* CLASS */)
                        ])
                      ]),
                      _: 1 /* STABLE */
                    })
                  ]),
                  _: 1 /* STABLE */
                }),
                _createVNode(_component_v_main, {
                  id: "app-main",
                  tabindex: "-1"
                }, {
                  default: _withCtx(() => [
                    _createVNode(_component_v_container, {
                      fluid: "",
                      class: "pa-4 app-shell fill-height"
                    }, {
                      default: _withCtx(() => [
                        isOffline
                          ? (_openBlock(), _createBlock(_component_v_alert, {
                              key: 0,
                              type: "warning",
                              variant: "tonal",
                              density: "compact",
                              class: "mb-3"
                            }, {
                              default: _withCtx(() => [
                                _createTextVNode(" You are offline. Changes are saved locally. ")
                              ]),
                              _: 1 /* STABLE */
                            }))
                          : _createCommentVNode("v-if", true),
                        _createCommentVNode(" Lot Selector "),
                        (currentTab !== 'portfolio')
                          ? (_openBlock(), _createBlock(_component_v_card, {
                              key: 1,
                              class: "mb-4 preset-card",
                              elevation: "4"
                            }, {
                              default: _withCtx(() => [
                                _createVNode(_component_v_card_text, { class: "py-2" }, {
                                  default: _withCtx(() => [
                                    _createVNode(_component_v_row, {
                                      dense: "",
                                      align: "center",
                                      class: "lot-selector-row"
                                    }, {
                                      default: _withCtx(() => [
                                        _createVNode(_component_v_col, {
                                          cols: "9",
                                          sm: "9",
                                          md: "10",
                                          class: "lot-selector-select-col"
                                        }, {
                                          default: _withCtx(() => [
                                            _createVNode(_component_v_select, {
                                              "model-value": currentLotId,
                                              items: lotItems,
                                              "item-title": "title",
                                              "item-value": "value",
                                              label: "Lot",
                                              "prepend-inner-icon": "mdi-bookmark",
                                              variant: "outlined",
                                              density: "compact",
                                              "hide-details": "",
                                              "menu-icon": "mdi-chevron-down",
                                              "onUpdate:modelValue": selectLot
                                            }, {
                                              selection: _withCtx(({ item }) => [
                                                (item?.raw)
                                                  ? (_openBlock(), _createElementBlock("div", {
                                                      key: 0,
                                                      class: "lot-selector-selection"
                                                    }, [
                                                      _createElementVNode("div", { class: "lot-selector-selection__title-row" }, [
                                                        _createElementVNode("span", { class: "lot-selector-icon-stack" }, [
                                                          _createVNode(_component_v_icon, { size: "16" }, {
                                                            default: _withCtx(() => [
                                                              _createTextVNode(_toDisplayString(item.raw.symbolIcon), 1 /* TEXT */)
                                                            ]),
                                                            _: 2 /* DYNAMIC */
                                                          }, 1024 /* DYNAMIC_SLOTS */),
                                                          (item.raw.completionIcon)
                                                            ? (_openBlock(), _createBlock(_component_v_icon, {
                                                                key: 0,
                                                                size: "12",
                                                                color: "success",
                                                                class: "lot-selector-icon-stack__badge"
                                                              }, {
                                                                default: _withCtx(() => [
                                                                  _createTextVNode(_toDisplayString(item.raw.completionIcon), 1 /* TEXT */)
                                                                ]),
                                                                _: 2 /* DYNAMIC */
                                                              }, 1024 /* DYNAMIC_SLOTS */))
                                                            : _createCommentVNode("v-if", true)
                                                        ]),
                                                        _createElementVNode("div", { class: "lot-selector-selection__title" }, _toDisplayString(item.raw.title), 1 /* TEXT */)
                                                      ]),
                                                      _createElementVNode("div", { class: "lot-selector-selection__subtitle" }, _toDisplayString(item.raw.subtitle), 1 /* TEXT */)
                                                    ]))
                                                  : _createCommentVNode("v-if", true)
                                              ]),
                                              item: _withCtx(({ props, item }) => [
                                                _createElementVNode("div", null, [
                                                  (item.raw.groupLabel)
                                                    ? (_openBlock(), _createElementBlock("div", {
                                                        key: 0,
                                                        class: "lot-selector-group-label"
                                                      }, [
                                                        _createVNode(_component_v_icon, {
                                                          size: "14",
                                                          class: "mr-1"
                                                        }, {
                                                          default: _withCtx(() => [
                                                            _createTextVNode(_toDisplayString(item.raw.lotType === 'singles' ? 'mdi-cards-outline' : 'mdi-cube-outline'), 1 /* TEXT */)
                                                          ]),
                                                          _: 2 /* DYNAMIC */
                                                        }, 1024 /* DYNAMIC_SLOTS */),
                                                        _createTextVNode(" " + _toDisplayString(item.raw.groupLabel), 1 /* TEXT */)
                                                      ]))
                                                    : _createCommentVNode("v-if", true),
                                                  _createVNode(_component_v_list_item, _mergeProps(props, {
                                                    title: undefined,
                                                    subtitle: undefined
                                                  }), {
                                                    prepend: _withCtx(() => [
                                                      _createElementVNode("span", { class: "lot-selector-icon-stack mr-2" }, [
                                                        _createVNode(_component_v_icon, { size: "18" }, {
                                                          default: _withCtx(() => [
                                                            _createTextVNode(_toDisplayString(item.raw.symbolIcon), 1 /* TEXT */)
                                                          ]),
                                                          _: 2 /* DYNAMIC */
                                                        }, 1024 /* DYNAMIC_SLOTS */),
                                                        (item.raw.completionIcon)
                                                          ? (_openBlock(), _createBlock(_component_v_icon, {
                                                              key: 0,
                                                              size: "12",
                                                              color: "success",
                                                              class: "lot-selector-icon-stack__badge"
                                                            }, {
                                                              default: _withCtx(() => [
                                                                _createTextVNode(_toDisplayString(item.raw.completionIcon), 1 /* TEXT */)
                                                              ]),
                                                              _: 2 /* DYNAMIC */
                                                            }, 1024 /* DYNAMIC_SLOTS */))
                                                          : _createCommentVNode("v-if", true)
                                                      ])
                                                    ]),
                                                    default: _withCtx(() => [
                                                      _createVNode(_component_v_list_item_title, { class: "text-body-2 font-weight-medium" }, {
                                                        default: _withCtx(() => [
                                                          _createTextVNode(_toDisplayString(item.raw.title), 1 /* TEXT */)
                                                        ]),
                                                        _: 2 /* DYNAMIC */
                                                      }, 1024 /* DYNAMIC_SLOTS */),
                                                      _createVNode(_component_v_list_item_subtitle, { class: "text-caption" }, {
                                                        default: _withCtx(() => [
                                                          _createTextVNode(_toDisplayString(item.raw.subtitle), 1 /* TEXT */)
                                                        ]),
                                                        _: 2 /* DYNAMIC */
                                                      }, 1024 /* DYNAMIC_SLOTS */)
                                                    ]),
                                                    _: 2 /* DYNAMIC */
                                                  }, 1040 /* FULL_PROPS, DYNAMIC_SLOTS */, ["title", "subtitle"])
                                                ])
                                              ]),
                                              _: 1 /* STABLE */
                                            }, 8 /* PROPS */, ["model-value", "items", "onUpdate:modelValue"])
                                          ]),
                                          _: 1 /* STABLE */
                                        }),
                                        _createVNode(_component_v_col, {
                                          cols: "3",
                                          sm: "3",
                                          md: "2",
                                          class: "lot-selector-meta-col"
                                        }, {
                                          default: _withCtx(() => [
                                            _createElementVNode("div", { class: "lot-selector-meta" }, [
                                              _createElementVNode("div", { class: "lot-selector-actions" }, [
                                                hasLotSelected
                                                  ? (_openBlock(), _createBlock(_component_v_btn, {
                                                      key: 0,
                                                      icon: "mdi-pencil",
                                                      size: "small",
                                                      variant: "tonal",
                                                      color: "secondary",
                                                      class: "lot-rename-btn",
                                                      title: "Edit lot",
                                                      "aria-label": "Edit lot",
                                                      onClick: openRenameLotModal
                                                    }, null, 8 /* PROPS */, ["onClick"]))
                                                  : _createCommentVNode("v-if", true),
                                                _createVNode(_component_v_btn, {
                                                  icon: "mdi-bookmark-plus",
                                                  size: "small",
                                                  variant: "tonal",
                                                  color: "primary",
                                                  class: "lot-add-btn",
                                                  title: "Add lot",
                                                  "aria-label": "Add lot",
                                                  onClick: $event => (showNewLotModal = true)
                                                }, null, 8 /* PROPS */, ["onClick"])
                                              ])
                                            ])
                                          ]),
                                          _: 1 /* STABLE */
                                        })
                                      ]),
                                      _: 1 /* STABLE */
                                    })
                                  ]),
                                  _: 1 /* STABLE */
                                })
                              ]),
                              _: 1 /* STABLE */
                            }))
                          : _createCommentVNode("v-if", true),
                        (!hasLotSelected)
                          ? (_openBlock(), _createBlock(_component_v_alert, {
                              key: 2,
                              type: "warning",
                              variant: "tonal",
                              density: "compact",
                              icon: "mdi-information-outline",
                              class: "app-empty-state-alert mb-4"
                            }, {
                              default: _withCtx(() => [
                                _createElementVNode("span", { class: "app-empty-state-alert__label" }, "No lot selected."),
                                _createTextVNode(" Create or select a lot to use Live pricing and Sales tracking. ")
                              ]),
                              _: 1 /* STABLE */
                            }))
                          : _createCommentVNode("v-if", true),
                        _createCommentVNode(" Tab Content "),
                        _createElementVNode("div", {
                          class: _normalizeClass({ 'interaction-disabled': !hasLotSelected }),
                          style: _normalizeStyle(!hasLotSelected ? 'pointer-events: none;' : null)
                        }, [
                          _createVNode(_component_v_window, {
                            modelValue: currentTab,
                            "onUpdate:modelValue": $event => ((currentTab) = $event),
                            class: _normalizeClass(['tabs-window', { 'tabs-window--allow-sticky': currentLotType === 'singles' && (currentTab === 'live' || currentTab === 'config') }]),
                            transition: "tab-slide-fast",
                            "reverse-transition": "tab-slide-fast-reverse"
                          }, {
                            default: _withCtx(() => [
                              _createCommentVNode(" CONFIG "),
                              _createVNode(_component_v_window_item, {
                                key: "config",
                                value: "config",
                                eager: ""
                              }, {
                                default: _withCtx(() => [
                                  (hasLotSelected && currentLotType === 'singles')
                                    ? (_openBlock(), _createBlock(_component_singles_config_window, {
                                        key: 0,
                                        ref: "singlesConfigWindow",
                                        ctx: $root
                                      }, null, 8 /* PROPS */, ["ctx"]))
                                    : (_openBlock(), _createBlock(_component_config_window, {
                                        key: 1,
                                        ctx: $root
                                      }, null, 8 /* PROPS */, ["ctx"]))
                                ]),
                                _: 1 /* STABLE */
                              }),
                              _createCommentVNode(" LIVE "),
                              _createVNode(_component_v_window_item, {
                                key: "live",
                                value: "live",
                                eager: ""
                              }, {
                                default: _withCtx(() => [
                                  _createVNode(_component_live_window, {
                                    ref: "liveWindow",
                                    ctx: $root
                                  }, null, 8 /* PROPS */, ["ctx"])
                                ]),
                                _: 1 /* STABLE */
                              }),
                              _createCommentVNode(" SALES "),
                              _createVNode(_component_v_window_item, {
                                key: "sales",
                                value: "sales",
                                eager: ""
                              }, {
                                default: _withCtx(() => [
                                  _createVNode(_component_sales_window, {
                                    ref: "salesWindow",
                                    ctx: $root
                                  }, null, 8 /* PROPS */, ["ctx"])
                                ]),
                                _: 1 /* STABLE */
                              }),
                              _createCommentVNode(" PORTFOLIO "),
                              _createVNode(_component_v_window_item, {
                                key: "portfolio",
                                value: "portfolio",
                                eager: ""
                              }, {
                                default: _withCtx(() => [
                                  _createVNode(_component_portfolio_window, {
                                    ref: "portfolioWindow",
                                    ctx: $root
                                  }, null, 8 /* PROPS */, ["ctx"])
                                ]),
                                _: 1 /* STABLE */
                              }),
                              _createCommentVNode(" WHEEL "),
                              _createVNode(_component_v_window_item, {
                                key: "wheel",
                                value: "wheel",
                                eager: ""
                              }, {
                                default: _withCtx(() => [
                                  _createVNode(_component_wheel_window, {
                                    ref: "wheelWindow",
                                    ctx: $root
                                  }, null, 8 /* PROPS */, ["ctx"])
                                ]),
                                _: 1 /* STABLE */
                              })
                            ]),
                            _: 1 /* STABLE */
                          }, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue", "class"])
                        ], 6 /* CLASS, STYLE */),
                        _createElementVNode("div", { style: {"height":"calc(5rem + env(safe-area-inset-bottom))"} })
                      ]),
                      _: 1 /* STABLE */
                    }),
                    _createCommentVNode(" Bottom Nav "),
                    _createVNode(_component_v_bottom_navigation, {
                      modelValue: currentTab,
                      "onUpdate:modelValue": $event => ((currentTab) = $event),
                      color: "primary",
                      grow: "",
                      elevation: "8",
                      mandatory: "",
                      "aria-label": "Primary navigation"
                    }, {
                      default: _withCtx(() => [
                        _createVNode(_component_v_btn, {
                          value: "config",
                          ripple: false
                        }, {
                          default: _withCtx(() => [
                            _createVNode(_component_v_icon, null, {
                              default: _withCtx(() => [
                                _createTextVNode("mdi-cog")
                              ]),
                              _: 1 /* STABLE */
                            }),
                            _createElementVNode("span", null, "Config")
                          ]),
                          _: 1 /* STABLE */
                        }, 8 /* PROPS */, ["ripple"]),
                        _createVNode(_component_v_btn, {
                          value: "live",
                          disabled: isLiveTabDisabled,
                          ripple: false
                        }, {
                          default: _withCtx(() => [
                            _createVNode(_component_v_icon, null, {
                              default: _withCtx(() => [
                                _createTextVNode("mdi-target")
                              ]),
                              _: 1 /* STABLE */
                            }),
                            _createElementVNode("span", null, "Live")
                          ]),
                          _: 1 /* STABLE */
                        }, 8 /* PROPS */, ["disabled", "ripple"]),
                        _createVNode(_component_v_btn, {
                          value: "sales",
                          disabled: !hasLotSelected,
                          ripple: false
                        }, {
                          default: _withCtx(() => [
                            _createVNode(_component_v_icon, null, {
                              default: _withCtx(() => [
                                _createTextVNode("mdi-chart-line")
                              ]),
                              _: 1 /* STABLE */
                            }),
                            _createElementVNode("span", null, "Sales")
                          ]),
                          _: 1 /* STABLE */
                        }, 8 /* PROPS */, ["disabled", "ripple"]),
                        _createVNode(_component_v_btn, {
                          value: "wheel",
                          disabled: !hasLotSelected,
                          ripple: false
                        }, {
                          default: _withCtx(() => [
                            _createVNode(_component_v_icon, null, {
                              default: _withCtx(() => [
                                _createTextVNode("mdi-tire")
                              ]),
                              _: 1 /* STABLE */
                            }),
                            _createElementVNode("span", null, "Wheel")
                          ]),
                          _: 1 /* STABLE */
                        }, 8 /* PROPS */, ["disabled", "ripple"]),
                        _createVNode(_component_v_btn, {
                          value: "portfolio",
                          disabled: !hasLotSelected,
                          ripple: false
                        }, {
                          default: _withCtx(() => [
                            _createVNode(_component_v_icon, null, {
                              default: _withCtx(() => [
                                _createTextVNode("mdi-briefcase-outline")
                              ]),
                              _: 1 /* STABLE */
                            }),
                            _createElementVNode("span", null, "Portfolio")
                          ]),
                          _: 1 /* STABLE */
                        }, 8 /* PROPS */, ["disabled", "ripple"])
                      ]),
                      _: 1 /* STABLE */
                    }, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue"])
                  ]),
                  _: 1 /* STABLE */
                }),
                (currentTab === 'config' && currentLotType === 'singles')
                  ? (_openBlock(), _createBlock(_component_v_fab, {
                      key: 0,
                      icon: "mdi-plus",
                      color: "primary",
                      size: "large",
                      title: "Add singles purchase",
                      "aria-label": "Add singles purchase",
                      disabled: !hasLotSelected,
                      onClick: $event => ($refs.singlesConfigWindow?.handleAddSinglesPurchase?.()),
                      class: "fab-primary fab-add-preset"
                    }, null, 8 /* PROPS */, ["disabled", "onClick"]))
                  : _createCommentVNode("v-if", true),
                (currentTab === 'live')
                  ? (_openBlock(), _createBlock(_component_v_fab, {
                      key: 1,
                      icon: "mdi-calculator",
                      color: "secondary",
                      size: "large",
                      title: hasProAccess ? 'Price calculator' : 'Upgrade to unlock price calculator',
                      "aria-label": hasProAccess ? 'Open price calculator' : 'Upgrade to unlock price calculator',
                      disabled: !hasLotSelected,
                      onClick: $event => (accessProFeature('autoCalculate')),
                      class: "fab-primary fab-live-calc"
                    }, null, 8 /* PROPS */, ["title", "aria-label", "disabled", "onClick"]))
                  : _createCommentVNode("v-if", true),
                (currentTab === 'live' && currentLotType === 'singles')
                  ? (_openBlock(), _createBlock(_component_v_fab, {
                      key: 2,
                      icon: "mdi-broom",
                      color: "error",
                      size: "large",
                      title: "Clear selected live singles",
                      "aria-label": "Clear selected live singles",
                      disabled: !hasLotSelected || effectiveLiveSinglesIds.length === 0,
                      onClick: $event => (askConfirmation(
          {
            title: 'Clear live singles list?',
            text: 'This will remove all selected cards from Live Singles.',
            color: 'error'
          },
          () => clearLiveSinglesSelection()
        )),
                      class: "fab-primary fab-live-clear"
                    }, null, 8 /* PROPS */, ["disabled", "onClick"]))
                  : _createCommentVNode("v-if", true),
                (currentTab === 'live')
                  ? (_openBlock(), _createBlock(_component_v_fab, {
                      key: 3,
                      icon: "mdi-restore",
                      color: "surface",
                      size: "large",
                      title: currentLotType === 'singles' ? 'Reset live singles prices' : 'Reset live prices',
                      "aria-label": currentLotType === 'singles' ? 'Reset live singles prices' : 'Reset live prices',
                      onClick: resetLivePrices,
                      class: "fab-primary fab-live-reset"
                    }, null, 8 /* PROPS */, ["title", "aria-label", "onClick"]))
                  : _createCommentVNode("v-if", true),
                (currentTab === 'live' && currentLotType !== 'singles')
                  ? (_openBlock(), _createBlock(_component_v_fab, {
                      key: 4,
                      icon: "mdi-content-save-outline",
                      color: "primary",
                      size: "large",
                      title: "Apply live prices to config",
                      "aria-label": "Apply live prices to config",
                      disabled: !hasLotSelected,
                      onClick: applyLivePricesToDefaults,
                      class: "fab-primary fab-calculate"
                    }, null, 8 /* PROPS */, ["disabled", "onClick"]))
                  : _createCommentVNode("v-if", true),
                _createCommentVNode(" Primary FAB - Sales "),
                (currentTab === 'sales' && hasProAccess)
                  ? (_openBlock(), _createElementBlock("div", {
                      key: 5,
                      class: "fab-overflow-wrap fab-overflow-sales"
                    }, [
                      _createVNode(_component_v_speed_dial, {
                        modelValue: speedDialOpenSales,
                        "onUpdate:modelValue": $event => ((speedDialOpenSales) = $event),
                        location: "top center",
                        transition: "scale-transition",
                        "open-on-hover": false,
                        "close-on-content-click": false
                      }, {
                        activator: _withCtx(({ props: activatorProps }) => [
                          _createVNode(_component_v_fab, _mergeProps(activatorProps, {
                            icon: "mdi-cart-plus",
                            color: "primary",
                            size: "large",
                            title: "Add sale",
                            "aria-label": "Add sale",
                            disabled: !hasLotSelected
                          }), null, 16 /* FULL_PROPS */, ["disabled"])
                        ]),
                        default: _withCtx(() => [
                          (currentLotType === 'singles')
                            ? (_openBlock(), _createBlock(_component_v_btn, {
                                key: 'card',
                                icon: "mdi-cards-outline",
                                color: "primary",
                                variant: "elevated",
                                size: "small",
                                class: "sales-speed-action",
                                title: "Add item sale",
                                "aria-label": "Add item sale",
                                disabled: !hasLotSelected,
                                onClick: $event => {openAddSaleModal('pack'); speedDialOpenSales = false}
                              }, null, 8 /* PROPS */, ["disabled", "onClick"]))
                            : (_openBlock(), _createElementBlock(_Fragment, { key: 1 }, [
                                (_openBlock(), _createBlock(_component_v_btn, {
                                  key: 'item',
                                  icon: "mdi-tag-outline",
                                  color: "primary",
                                  variant: "elevated",
                                  size: "small",
                                  class: "sales-speed-action",
                                  title: 'Add item sale',
                                  "aria-label": 'Add item sale',
                                  disabled: !hasLotSelected,
                                  onClick: $event => {openAddSaleModal('pack'); speedDialOpenSales = false}
                                }, null, 8 /* PROPS */, ["title", "aria-label", "disabled", "onClick"])),
                                (_openBlock(), _createBlock(_component_v_btn, {
                                  key: 'box',
                                  icon: "mdi-cube-outline",
                                  color: "secondary",
                                  variant: "elevated",
                                  size: "small",
                                  class: "sales-speed-action",
                                  title: 'Add box sale',
                                  "aria-label": 'Add box sale',
                                  disabled: !hasLotSelected,
                                  onClick: $event => {openAddSaleModal('box'); speedDialOpenSales = false}
                                }, null, 8 /* PROPS */, ["title", "aria-label", "disabled", "onClick"])),
                                (_openBlock(), _createBlock(_component_v_btn, {
                                  key: 'rtyh',
                                  icon: "mdi-cards-playing-outline",
                                  color: "success",
                                  variant: "elevated",
                                  size: "small",
                                  class: "sales-speed-action",
                                  title: 'Add RTYH sale',
                                  "aria-label": 'Add RTYH sale',
                                  disabled: !hasLotSelected,
                                  onClick: $event => {openAddSaleModal('rtyh'); speedDialOpenSales = false}
                                }, null, 8 /* PROPS */, ["title", "aria-label", "disabled", "onClick"]))
                              ], 64 /* STABLE_FRAGMENT */))
                        ]),
                        _: 1 /* STABLE */
                      }, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue", "open-on-hover", "close-on-content-click"])
                    ]))
                  : (currentTab === 'sales')
                    ? (_openBlock(), _createBlock(_component_v_fab, {
                        key: 6,
                        icon: "mdi-cart-plus",
                        color: "primary",
                        size: "large",
                        title: "Upgrade to unlock sales tracking",
                        "aria-label": "Upgrade to unlock sales tracking",
                        disabled: !hasLotSelected,
                        onClick: $event => (accessProFeature('salesTracking')),
                        class: "fab-primary"
                      }, null, 8 /* PROPS */, ["disabled", "onClick"]))
                    : _createCommentVNode("v-if", true),
                (currentTab === 'portfolio')
                  ? (_openBlock(), _createBlock(_component_v_fab, {
                      key: 7,
                      icon: "mdi-table",
                      color: "primary",
                      size: "large",
                      title: !hasPortfolioData
          ? 'Open portfolio report'
          : (hasProAccess ? 'Open portfolio report' : 'Upgrade to unlock portfolio reports'),
                      "aria-label": !hasPortfolioData
          ? 'Open portfolio report'
          : (hasProAccess ? 'Open portfolio report' : 'Upgrade to unlock portfolio reports'),
                      disabled: !hasPortfolioData,
                      onClick: $event => (accessProFeature('portfolioReport')),
                      class: "fab-primary fab-portfolio-report"
                    }, null, 8 /* PROPS */, ["title", "aria-label", "disabled", "onClick"]))
                  : _createCommentVNode("v-if", true),
                _createVNode(_component_v_dialog, {
                  modelValue: showCreateWorkspaceModal,
                  "onUpdate:modelValue": $event => ((showCreateWorkspaceModal) = $event),
                  "max-width": "460"
                }, {
                  default: _withCtx(() => [
                    _createVNode(_component_v_card, null, {
                      default: _withCtx(() => [
                        _createVNode(_component_v_card_title, null, {
                          default: _withCtx(() => [
                            _createTextVNode("Create Shared Workspace")
                          ]),
                          _: 1 /* STABLE */
                        }),
                        _createVNode(_component_v_card_text, null, {
                          default: _withCtx(() => [
                            _createElementVNode("p", { class: "text-body-2 text-medium-emphasis mb-4" }, " This starts a new shared workspace and copies your current Personal data into it. "),
                            _createVNode(_component_v_text_field, {
                              modelValue: newWorkspaceName,
                              "onUpdate:modelValue": $event => ((newWorkspaceName) = $event),
                              label: "Workspace name",
                              variant: "outlined",
                              density: "comfortable",
                              onKeyup: _withKeys(createWorkspace, ["enter"])
                            }, null, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue", "onKeyup"])
                          ]),
                          _: 1 /* STABLE */
                        }),
                        _createVNode(_component_v_card_actions, null, {
                          default: _withCtx(() => [
                            _createVNode(_component_v_spacer),
                            _createVNode(_component_v_btn, {
                              variant: "text",
                              onClick: $event => (showCreateWorkspaceModal = false)
                            }, {
                              default: _withCtx(() => [
                                _createTextVNode("Cancel")
                              ]),
                              _: 1 /* STABLE */
                            }, 8 /* PROPS */, ["onClick"]),
                            _createVNode(_component_v_btn, {
                              color: "primary",
                              loading: isCreatingWorkspace,
                              disabled: activeScopeType !== 'personal',
                              onClick: createWorkspace
                            }, {
                              default: _withCtx(() => [
                                _createTextVNode(" Create workspace ")
                              ]),
                              _: 1 /* STABLE */
                            }, 8 /* PROPS */, ["loading", "disabled", "onClick"])
                          ]),
                          _: 1 /* STABLE */
                        })
                      ]),
                      _: 1 /* STABLE */
                    })
                  ]),
                  _: 1 /* STABLE */
                }, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue"]),
                _createVNode(_component_v_dialog, {
                  modelValue: showWorkspaceMembersModal,
                  "onUpdate:modelValue": $event => ((showWorkspaceMembersModal) = $event),
                  "max-width": "760",
                  "content-class": "workspace-members-dialog"
                }, {
                  default: _withCtx(() => [
                    _createVNode(_component_v_card, { class: "workspace-members-card" }, {
                      default: _withCtx(() => [
                        _createVNode(_component_v_card_title, { class: "workspace-members-card__title" }, {
                          default: _withCtx(() => [
                            _createElementVNode("div", { class: "workspace-members-card__title-copy" }, [
                              _createElementVNode("div", { class: "workspace-members-card__eyebrow" }, "Shared Workspace"),
                              _createElementVNode("div", { class: "workspace-members-card__headline-row" }, [
                                _createElementVNode("div", { class: "workspace-members-card__headline" }, _toDisplayString(currentWorkspaceName), 1 /* TEXT */),
                                _createElementVNode("div", { class: "workspace-members-card__header-actions" }, [
                                  isCurrentWorkspaceOwner
                                    ? (_openBlock(), _createBlock(_component_v_btn, {
                                        key: 0,
                                        size: "small",
                                        variant: "tonal",
                                        color: "secondary",
                                        "prepend-icon": "mdi-link-variant",
                                        class: "workspace-members-card__invite-btn",
                                        title: "Invite link",
                                        "aria-label": "Invite link",
                                        loading: isCreatingWorkspaceJoinLink,
                                        onClick: createWorkspaceJoinLink
                                      }, {
                                        default: _withCtx(() => [
                                          _createTextVNode(" Invite ")
                                        ]),
                                        _: 1 /* STABLE */
                                      }, 8 /* PROPS */, ["loading", "onClick"]))
                                    : _createCommentVNode("v-if", true),
                                  _createVNode(_component_v_btn, {
                                    icon: "mdi-exit-to-app",
                                    size: "small",
                                    variant: "tonal",
                                    color: "error",
                                    class: "workspace-members-card__leave-btn",
                                    title: "Leave workspace",
                                    "aria-label": "Leave workspace",
                                    onClick: openLeaveWorkspaceModal
                                  }, null, 8 /* PROPS */, ["onClick"])
                                ])
                              ])
                            ])
                          ]),
                          _: 1 /* STABLE */
                        }),
                        _createVNode(_component_v_card_text, { class: "workspace-members-card__content" }, {
                          default: _withCtx(() => [
                            _createElementVNode("div", { class: "workspace-members-section" }, [
                              _createElementVNode("div", { class: "workspace-members-section__header" }, _toDisplayString(isWorkspaceMembersLoading
                  ? 'Members'
                  : `Members (${workspaceMembers.length})`), 1 /* TEXT */)
                            ]),
                            isWorkspaceMembersLoading
                              ? (_openBlock(), _createElementBlock("div", {
                                  key: 0,
                                  class: "workspace-member-list workspace-member-list--loading"
                                }, [
                                  (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(2, (skeletonIndex) => {
                                    return (_openBlock(), _createElementBlock("article", {
                                      key: `workspace-member-skeleton-${skeletonIndex}`,
                                      class: "workspace-member-card-row workspace-member-card-row--skeleton"
                                    }, [
                                      _createElementVNode("div", { class: "workspace-member-card-row__identity" }, [
                                        _createVNode(_component_v_skeleton_loader, {
                                          type: "avatar",
                                          class: "workspace-member-card-row__skeleton-avatar"
                                        }),
                                        _createElementVNode("div", { class: "workspace-member-card-row__copy workspace-member-card-row__copy--skeleton" }, [
                                          _createVNode(_component_v_skeleton_loader, {
                                            type: "text",
                                            class: "workspace-member-card-row__skeleton-name"
                                          }),
                                          _createVNode(_component_v_skeleton_loader, {
                                            type: "text",
                                            class: "workspace-member-card-row__skeleton-id"
                                          }),
                                          _createVNode(_component_v_skeleton_loader, {
                                            type: "text",
                                            class: "workspace-member-card-row__skeleton-meta"
                                          })
                                        ])
                                      ])
                                    ]))
                                  }), 128 /* KEYED_FRAGMENT */))
                                ]))
                              : (workspaceMembers.length)
                                ? (_openBlock(), _createElementBlock("div", {
                                    key: 1,
                                    class: "workspace-member-list"
                                  }, [
                                    (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(workspaceMembers, (member) => {
                                      return (_openBlock(), _createElementBlock("article", {
                                        key: `${member.workspaceId}-${member.userId}`,
                                        class: "workspace-member-card-row"
                                      }, [
                                        _createElementVNode("div", { class: "workspace-member-card-row__identity" }, [
                                          _createVNode(_component_v_avatar, {
                                            size: "52",
                                            color: "primary",
                                            class: "workspace-member-card-row__avatar"
                                          }, {
                                            default: _withCtx(() => [
                                              (member.photoUrl)
                                                ? (_openBlock(), _createElementBlock("img", {
                                                    key: 0,
                                                    src: member.photoUrl,
                                                    alt: member.displayName || member.userId,
                                                    class: "account-avatar-img",
                                                    referrerpolicy: "no-referrer"
                                                  }, null, 8 /* PROPS */, ["src", "alt"]))
                                                : (_openBlock(), _createElementBlock("span", {
                                                    key: 1,
                                                    class: "workspace-member-card-row__initial"
                                                  }, _toDisplayString((member.displayName || member.userId || '?').slice(0, 1).toUpperCase()), 1 /* TEXT */))
                                            ]),
                                            _: 2 /* DYNAMIC */
                                          }, 1024 /* DYNAMIC_SLOTS */),
                                          _createElementVNode("span", {
                                            class: _normalizeClass(["workspace-member-card-row__presence", `workspace-member-card-row__presence--${getWorkspaceMemberPresenceState(member)}`]),
                                            title: getWorkspaceMemberPresenceLabel(member)
                                          }, null, 10 /* CLASS, PROPS */, ["title"]),
                                          _createElementVNode("div", { class: "workspace-member-card-row__copy" }, [
                                            _createElementVNode("div", { class: "workspace-member-card-row__name-row" }, [
                                              _createElementVNode("div", { class: "workspace-member-card-row__name" }, _toDisplayString(member.displayName || 'Workspace member'), 1 /* TEXT */),
                                              _createVNode(_component_v_chip, {
                                                size: "x-small",
                                                variant: "tonal",
                                                color: member.role === 'owner' ? 'primary' : undefined
                                              }, {
                                                default: _withCtx(() => [
                                                  _createTextVNode(_toDisplayString(member.role === 'owner' ? 'Owner' : 'Member'), 1 /* TEXT */)
                                                ]),
                                                _: 2 /* DYNAMIC */
                                              }, 1032 /* PROPS, DYNAMIC_SLOTS */, ["color"])
                                            ]),
                                            _createElementVNode("div", { class: "workspace-member-card-row__id" }, _toDisplayString(member.userId), 1 /* TEXT */),
                                            _createElementVNode("div", { class: "workspace-member-card-row__meta" }, [
                                              _createElementVNode("span", {
                                                class: _normalizeClass(["workspace-member-card-row__presence-label", `workspace-member-card-row__presence-label--${getWorkspaceMemberPresenceState(member)}`])
                                              }, _toDisplayString(getWorkspaceMemberPresenceLabel(member)), 3 /* TEXT, CLASS */),
                                              (!member.displayName)
                                                ? (_openBlock(), _createElementBlock("span", { key: 0 }, "Profile name unavailable"))
                                                : _createCommentVNode("v-if", true),
                                              _createElementVNode("span", null, "Updated " + _toDisplayString(formatDate(member.updatedAt)), 1 /* TEXT */)
                                            ])
                                          ])
                                        ]),
                                        _createElementVNode("div", { class: "workspace-member-card-row__actions" }, [
                                          (isCurrentWorkspaceOwner && member.role !== 'owner')
                                            ? (_openBlock(), _createBlock(_component_v_btn, {
                                                key: 0,
                                                size: "small",
                                                variant: "tonal",
                                                color: "error",
                                                "prepend-icon": "mdi-account-remove-outline",
                                                onClick: $event => (removeWorkspaceMember(member.userId))
                                              }, {
                                                default: _withCtx(() => [
                                                  _createTextVNode(" Remove ")
                                                ]),
                                                _: 2 /* DYNAMIC */
                                              }, 1032 /* PROPS, DYNAMIC_SLOTS */, ["onClick"]))
                                            : _createCommentVNode("v-if", true)
                                        ])
                                      ]))
                                    }), 128 /* KEYED_FRAGMENT */))
                                  ]))
                                : (_openBlock(), _createElementBlock("div", {
                                    key: 2,
                                    class: "workspace-members-empty"
                                  }, [
                                    _createVNode(_component_v_icon, {
                                      size: "34",
                                      color: "medium-emphasis"
                                    }, {
                                      default: _withCtx(() => [
                                        _createTextVNode("mdi-account-off-outline")
                                      ]),
                                      _: 1 /* STABLE */
                                    }),
                                    _createElementVNode("div", { class: "workspace-members-empty__title" }, "No members found"),
                                    _createElementVNode("div", { class: "workspace-members-empty__body" }, " Try refreshing the workspace or creating a new invite link. ")
                                  ]))
                          ]),
                          _: 1 /* STABLE */
                        }),
                        _createVNode(_component_v_card_actions, { class: "workspace-members-card__actions" }, {
                          default: _withCtx(() => [
                            _createVNode(_component_v_spacer),
                            _createVNode(_component_v_btn, {
                              variant: "text",
                              onClick: $event => (showWorkspaceMembersModal = false)
                            }, {
                              default: _withCtx(() => [
                                _createTextVNode("Close")
                              ]),
                              _: 1 /* STABLE */
                            }, 8 /* PROPS */, ["onClick"])
                          ]),
                          _: 1 /* STABLE */
                        })
                      ]),
                      _: 1 /* STABLE */
                    })
                  ]),
                  _: 1 /* STABLE */
                }, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue"]),
                _createVNode(_component_v_dialog, {
                  modelValue: showLeaveWorkspaceModal,
                  "onUpdate:modelValue": $event => ((showLeaveWorkspaceModal) = $event),
                  "max-width": "480"
                }, {
                  default: _withCtx(() => [
                    _createVNode(_component_v_card, null, {
                      default: _withCtx(() => [
                        _createVNode(_component_v_card_title, null, {
                          default: _withCtx(() => [
                            _createTextVNode("Leave Workspace")
                          ]),
                          _: 1 /* STABLE */
                        }),
                        _createVNode(_component_v_card_text, null, {
                          default: _withCtx(() => [
                            _createElementVNode("p", { class: "text-body-2 text-medium-emphasis mb-4" }, _toDisplayString(isCurrentWorkspaceOwner
                ? 'Owners need to transfer ownership before leaving, or confirm deletion if they are the last member.'
                : 'You will lose access to this shared workspace and return to Personal mode.'), 1 /* TEXT */),
                            (isCurrentWorkspaceOwner && workspaceMembers.some(member => member.role === 'member' && member.status === 'active'))
                              ? (_openBlock(), _createBlock(_component_v_select, {
                                  key: 0,
                                  modelValue: leaveWorkspaceTransferMemberUserId,
                                  "onUpdate:modelValue": $event => ((leaveWorkspaceTransferMemberUserId) = $event),
                                  items: workspaceMembers
                .filter(member => member.role === 'member' && member.status === 'active')
                .map(member => ({
                  title: member.displayName
                    ? `${member.displayName} (${member.userId.slice(0, 8)}...${member.userId.slice(-4)})`
                    : member.userId,
                  value: member.userId
                })),
                                  "item-title": "title",
                                  "item-value": "value",
                                  label: "New owner",
                                  variant: "outlined",
                                  density: "comfortable",
                                  hint: "Choose the member who should become owner when you leave.",
                                  "persistent-hint": ""
                                }, null, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue", "items"]))
                              : isCurrentWorkspaceOwner
                                ? (_openBlock(), _createBlock(_component_v_checkbox, {
                                    key: 1,
                                    modelValue: leaveWorkspaceDeleteConfirmation,
                                    "onUpdate:modelValue": $event => ((leaveWorkspaceDeleteConfirmation) = $event),
                                    color: "error",
                                    label: "I understand this will delete the workspace for everyone.",
                                    "hide-details": ""
                                  }, null, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue"]))
                                : _createCommentVNode("v-if", true)
                          ]),
                          _: 1 /* STABLE */
                        }),
                        _createVNode(_component_v_card_actions, null, {
                          default: _withCtx(() => [
                            _createVNode(_component_v_spacer),
                            _createVNode(_component_v_btn, {
                              variant: "text",
                              onClick: $event => (showLeaveWorkspaceModal = false)
                            }, {
                              default: _withCtx(() => [
                                _createTextVNode("Cancel")
                              ]),
                              _: 1 /* STABLE */
                            }, 8 /* PROPS */, ["onClick"]),
                            _createVNode(_component_v_btn, {
                              color: "error",
                              loading: isLeavingWorkspace,
                              onClick: leaveCurrentWorkspace
                            }, {
                              default: _withCtx(() => [
                                _createTextVNode(" Leave workspace ")
                              ]),
                              _: 1 /* STABLE */
                            }, 8 /* PROPS */, ["loading", "onClick"])
                          ]),
                          _: 1 /* STABLE */
                        })
                      ]),
                      _: 1 /* STABLE */
                    })
                  ]),
                  _: 1 /* STABLE */
                }, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue"]),
                _createVNode(_component_v_dialog, {
                  modelValue: showWorkspaceJoinDialog,
                  "onUpdate:modelValue": $event => ((showWorkspaceJoinDialog) = $event),
                  "max-width": "460"
                }, {
                  default: _withCtx(() => [
                    _createVNode(_component_v_card, null, {
                      default: _withCtx(() => [
                        _createVNode(_component_v_card_title, null, {
                          default: _withCtx(() => [
                            _createTextVNode("Join Workspace")
                          ]),
                          _: 1 /* STABLE */
                        }),
                        _createVNode(_component_v_card_text, null, {
                          default: _withCtx(() => [
                            _createElementVNode("p", { class: "text-body-1 mb-2" }, [
                              _createTextVNode(" Join "),
                              _createElementVNode("strong", null, _toDisplayString(pendingWorkspaceInviteWorkspaceName || pendingWorkspaceInviteWorkspaceId || 'this
                  workspace'), 1 /* TEXT */),
                              _createTextVNode("? ")
                            ]),
                            _createElementVNode("p", { class: "text-body-2 text-medium-emphasis" }, " This will add a new shared workspace alongside your Personal workspace. ")
                          ]),
                          _: 1 /* STABLE */
                        }),
                        _createVNode(_component_v_card_actions, null, {
                          default: _withCtx(() => [
                            _createVNode(_component_v_spacer),
                            _createVNode(_component_v_btn, {
                              variant: "text",
                              onClick: dismissPendingWorkspaceInvite
                            }, {
                              default: _withCtx(() => [
                                _createTextVNode("Cancel")
                              ]),
                              _: 1 /* STABLE */
                            }, 8 /* PROPS */, ["onClick"]),
                            _createVNode(_component_v_btn, {
                              color: "primary",
                              loading: isAcceptingWorkspaceInvite,
                              onClick: acceptPendingWorkspaceInvite
                            }, {
                              default: _withCtx(() => [
                                _createTextVNode(" Join workspace ")
                              ]),
                              _: 1 /* STABLE */
                            }, 8 /* PROPS */, ["loading", "onClick"])
                          ]),
                          _: 1 /* STABLE */
                        })
                      ]),
                      _: 1 /* STABLE */
                    })
                  ]),
                  _: 1 /* STABLE */
                }, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue"]),
                _createCommentVNode(" New Lot Modal "),
                _createVNode(_component_v_dialog, {
                  modelValue: showNewLotModal,
                  "onUpdate:modelValue": $event => ((showNewLotModal) = $event),
                  "max-width": "400"
                }, {
                  default: _withCtx(() => [
                    _createVNode(_component_v_card, null, {
                      default: _withCtx(() => [
                        _createVNode(_component_v_card_title, null, {
                          default: _withCtx(() => [
                            _createTextVNode("New Lot")
                          ]),
                          _: 1 /* STABLE */
                        }),
                        _createVNode(_component_v_card_text, null, {
                          default: _withCtx(() => [
                            _createVNode(_component_v_text_field, {
                              modelValue: lotNameDraft,
                              "onUpdate:modelValue": $event => ((lotNameDraft) = $event),
                              label: "Lot name",
                              variant: "outlined",
                              onKeyup: _withKeys(createNewLot, ["enter"])
                            }, null, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue", "onKeyup"]),
                            _createVNode(_component_v_btn_toggle, {
                              modelValue: newLotType,
                              "onUpdate:modelValue": $event => ((newLotType) = $event),
                              mandatory: "",
                              divided: "",
                              density: "compact",
                              variant: "outlined",
                              class: "mt-2 segment-toggle"
                            }, {
                              default: _withCtx(() => [
                                _createVNode(_component_v_btn, {
                                  value: "bulk",
                                  size: "small"
                                }, {
                                  default: _withCtx(() => [
                                    _createTextVNode("Bulk")
                                  ]),
                                  _: 1 /* STABLE */
                                }),
                                _createVNode(_component_v_btn, {
                                  value: "singles",
                                  size: "small"
                                }, {
                                  default: _withCtx(() => [
                                    _createTextVNode("Singles")
                                  ]),
                                  _: 1 /* STABLE */
                                })
                              ]),
                              _: 1 /* STABLE */
                            }, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue"]),
                            (newLotType === 'singles')
                              ? (_openBlock(), _createElementBlock("div", {
                                  key: 0,
                                  class: "mt-3"
                                }, [
                                  _createElementVNode("div", { class: "text-caption text-medium-emphasis mb-2" }, "Item catalog source"),
                                  _createVNode(_component_v_btn_toggle, {
                                    modelValue: newLotCatalogSource,
                                    "onUpdate:modelValue": $event => ((newLotCatalogSource) = $event),
                                    mandatory: "",
                                    divided: "",
                                    density: "compact",
                                    variant: "outlined",
                                    class: "segment-toggle"
                                  }, {
                                    default: _withCtx(() => [
                                      _createVNode(_component_v_btn, {
                                        value: "ua",
                                        size: "small"
                                      }, {
                                        default: _withCtx(() => [
                                          _createTextVNode("Union Arena")
                                        ]),
                                        _: 1 /* STABLE */
                                      }),
                                      _createVNode(_component_v_btn, {
                                        value: "pokemon",
                                        size: "small"
                                      }, {
                                        default: _withCtx(() => [
                                          _createTextVNode("Pokemon")
                                        ]),
                                        _: 1 /* STABLE */
                                      }),
                                      _createVNode(_component_v_btn, {
                                        value: "none",
                                        size: "small"
                                      }, {
                                        default: _withCtx(() => [
                                          _createTextVNode("Custom")
                                        ]),
                                        _: 1 /* STABLE */
                                      })
                                    ]),
                                    _: 1 /* STABLE */
                                  }, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue"])
                                ]))
                              : _createCommentVNode("v-if", true)
                          ]),
                          _: 1 /* STABLE */
                        }),
                        _createVNode(_component_v_card_actions, null, {
                          default: _withCtx(() => [
                            _createVNode(_component_v_spacer),
                            _createVNode(_component_v_btn, {
                              text: "",
                              onClick: $event => (showNewLotModal = false)
                            }, {
                              default: _withCtx(() => [
                                _createTextVNode("Cancel")
                              ]),
                              _: 1 /* STABLE */
                            }, 8 /* PROPS */, ["onClick"]),
                            _createVNode(_component_v_btn, {
                              color: "primary",
                              onClick: createNewLot
                            }, {
                              default: _withCtx(() => [
                                _createTextVNode("Create")
                              ]),
                              _: 1 /* STABLE */
                            }, 8 /* PROPS */, ["onClick"])
                          ]),
                          _: 1 /* STABLE */
                        })
                      ]),
                      _: 1 /* STABLE */
                    })
                  ]),
                  _: 1 /* STABLE */
                }, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue"]),
                _createCommentVNode(" Edit Lot Modal "),
                _createVNode(_component_v_dialog, {
                  modelValue: showRenameLotModal,
                  "onUpdate:modelValue": $event => ((showRenameLotModal) = $event),
                  "max-width": "400"
                }, {
                  default: _withCtx(() => [
                    _createVNode(_component_v_card, null, {
                      default: _withCtx(() => [
                        _createVNode(_component_v_card_title, null, {
                          default: _withCtx(() => [
                            _createTextVNode("Edit Lot")
                          ]),
                          _: 1 /* STABLE */
                        }),
                        _createVNode(_component_v_card_text, null, {
                          default: _withCtx(() => [
                            _createVNode(_component_v_text_field, {
                              modelValue: renameLotName,
                              "onUpdate:modelValue": $event => ((renameLotName) = $event),
                              label: "Lot name",
                              variant: "outlined",
                              onKeyup: _withKeys(renameCurrentLot, ["enter"])
                            }, null, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue", "onKeyup"]),
                            (currentLotType === 'singles')
                              ? (_openBlock(), _createElementBlock("div", {
                                  key: 0,
                                  class: "mt-3"
                                }, [
                                  _createElementVNode("div", { class: "text-caption text-medium-emphasis mb-2" }, "Item catalog source"),
                                  _createVNode(_component_v_btn_toggle, {
                                    "model-value": currentLotCatalogSource,
                                    mandatory: "",
                                    divided: "",
                                    density: "compact",
                                    variant: "outlined",
                                    class: "segment-toggle",
                                    "onUpdate:modelValue": setCurrentLotCatalogSource
                                  }, {
                                    default: _withCtx(() => [
                                      _createVNode(_component_v_btn, {
                                        value: "ua",
                                        size: "small"
                                      }, {
                                        default: _withCtx(() => [
                                          _createTextVNode("Union Arena")
                                        ]),
                                        _: 1 /* STABLE */
                                      }),
                                      _createVNode(_component_v_btn, {
                                        value: "pokemon",
                                        size: "small"
                                      }, {
                                        default: _withCtx(() => [
                                          _createTextVNode("Pokemon")
                                        ]),
                                        _: 1 /* STABLE */
                                      }),
                                      _createVNode(_component_v_btn, {
                                        value: "none",
                                        size: "small"
                                      }, {
                                        default: _withCtx(() => [
                                          _createTextVNode("Custom")
                                        ]),
                                        _: 1 /* STABLE */
                                      })
                                    ]),
                                    _: 1 /* STABLE */
                                  }, 8 /* PROPS */, ["model-value", "onUpdate:modelValue"]),
                                  _createElementVNode("div", { class: "text-caption text-medium-emphasis mt-2" }, _toDisplayString(currentLotCatalogSource === 'none'
                  ? 'Custom mode: autocomplete is disabled for this lot.'
                  : 'Autocomplete suggestions use the selected catalog source.'), 1 /* TEXT */)
                                ]))
                              : _createCommentVNode("v-if", true)
                          ]),
                          _: 1 /* STABLE */
                        }),
                        _createVNode(_component_v_card_actions, null, {
                          default: _withCtx(() => [
                            _createVNode(_component_v_btn, {
                              variant: "text",
                              color: "error",
                              disabled: !currentLotId,
                              onClick: $event => {showRenameLotModal = false; deleteCurrentLot()}
                            }, {
                              default: _withCtx(() => [
                                _createTextVNode(" Delete ")
                              ]),
                              _: 1 /* STABLE */
                            }, 8 /* PROPS */, ["disabled", "onClick"]),
                            _createVNode(_component_v_spacer),
                            _createVNode(_component_v_btn, {
                              text: "",
                              onClick: $event => (showRenameLotModal = false)
                            }, {
                              default: _withCtx(() => [
                                _createTextVNode("Cancel")
                              ]),
                              _: 1 /* STABLE */
                            }, 8 /* PROPS */, ["onClick"]),
                            _createVNode(_component_v_btn, {
                              color: "primary",
                              onClick: renameCurrentLot
                            }, {
                              default: _withCtx(() => [
                                _createTextVNode("Save")
                              ]),
                              _: 1 /* STABLE */
                            }, 8 /* PROPS */, ["onClick"])
                          ]),
                          _: 1 /* STABLE */
                        })
                      ]),
                      _: 1 /* STABLE */
                    })
                  ]),
                  _: 1 /* STABLE */
                }, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue"]),
                _createCommentVNode(" Verify Play Purchase Modal "),
                showManualPurchaseVerify
                  ? (_openBlock(), _createBlock(_component_v_dialog, {
                      key: 8,
                      modelValue: showVerifyPurchaseModal,
                      "onUpdate:modelValue": $event => ((showVerifyPurchaseModal) = $event),
                      "max-width": "520"
                    }, {
                      default: _withCtx(() => [
                        _createVNode(_component_v_card, null, {
                          default: _withCtx(() => [
                            _createVNode(_component_v_card_title, null, {
                              default: _withCtx(() => [
                                _createVNode(_component_v_icon, { class: "mr-2" }, {
                                  default: _withCtx(() => [
                                    _createTextVNode("mdi-check-decagram")
                                  ]),
                                  _: 1 /* STABLE */
                                }),
                                _createTextVNode(" Verify Play Purchase ")
                              ]),
                              _: 1 /* STABLE */
                            }),
                            _createVNode(_component_v_card_text, null, {
                              default: _withCtx(() => [
                                _createVNode(_component_v_text_field, {
                                  modelValue: purchaseTokenInput,
                                  "onUpdate:modelValue": $event => ((purchaseTokenInput) = $event),
                                  label: "Purchase Token",
                                  variant: "outlined",
                                  autocomplete: "off",
                                  class: "mb-2",
                                  hint: "Paste the real Google Play purchase token",
                                  "persistent-hint": ""
                                }, null, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue"]),
                                _createVNode(_component_v_text_field, {
                                  modelValue: purchaseProductIdInput,
                                  "onUpdate:modelValue": $event => ((purchaseProductIdInput) = $event),
                                  label: "Product ID (optional)",
                                  variant: "outlined",
                                  autocomplete: "off",
                                  class: "mb-2"
                                }, null, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue"]),
                                _createVNode(_component_v_text_field, {
                                  modelValue: purchasePackageNameInput,
                                  "onUpdate:modelValue": $event => ((purchasePackageNameInput) = $event),
                                  label: "Package Name (optional)",
                                  variant: "outlined",
                                  autocomplete: "off"
                                }, null, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue"])
                              ]),
                              _: 1 /* STABLE */
                            }),
                            _createVNode(_component_v_card_actions, null, {
                              default: _withCtx(() => [
                                _createVNode(_component_v_spacer),
                                _createVNode(_component_v_btn, {
                                  text: "",
                                  onClick: $event => (showVerifyPurchaseModal = false)
                                }, {
                                  default: _withCtx(() => [
                                    _createTextVNode("Cancel")
                                  ]),
                                  _: 1 /* STABLE */
                                }, 8 /* PROPS */, ["onClick"]),
                                _createVNode(_component_v_btn, {
                                  color: "primary",
                                  loading: isVerifyingPurchase,
                                  onClick: verifyProPurchase
                                }, {
                                  default: _withCtx(() => [
                                    _createTextVNode("Verify")
                                  ]),
                                  _: 1 /* STABLE */
                                }, 8 /* PROPS */, ["loading", "onClick"])
                              ]),
                              _: 1 /* STABLE */
                            })
                          ]),
                          _: 1 /* STABLE */
                        })
                      ]),
                      _: 1 /* STABLE */
                    }, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue"]))
                  : _createCommentVNode("v-if", true),
                _createCommentVNode(" Embedded Stripe Checkout Modal "),
                _createVNode(_component_v_dialog, {
                  modelValue: showStripeCheckoutModal,
                  "onUpdate:modelValue": $event => ((showStripeCheckoutModal) = $event),
                  "max-width": "560",
                  fullscreen: $vuetify?.display?.smAndDown,
                  persistent: ""
                }, {
                  default: _withCtx(() => [
                    _createVNode(_component_v_card, null, {
                      default: _withCtx(() => [
                        _createVNode(_component_v_card_title, null, {
                          default: _withCtx(() => [
                            _createVNode(_component_v_icon, { class: "mr-2" }, {
                              default: _withCtx(() => [
                                _createTextVNode("mdi-credit-card-lock-outline")
                              ]),
                              _: 1 /* STABLE */
                            }),
                            _createTextVNode(" Secure Checkout ")
                          ]),
                          _: 1 /* STABLE */
                        }),
                        _createVNode(_component_v_card_text, null, {
                          default: _withCtx(() => [
                            _createElementVNode("div", {
                              id: "stripe-embedded-checkout",
                              class: "stripe-embedded-checkout"
                            })
                          ]),
                          _: 1 /* STABLE */
                        }),
                        _createVNode(_component_v_card_actions, null, {
                          default: _withCtx(() => [
                            _createVNode(_component_v_spacer),
                            _createVNode(_component_v_btn, {
                              text: "",
                              onClick: closeStripeCheckoutModal
                            }, {
                              default: _withCtx(() => [
                                _createTextVNode("Cancel Checkout")
                              ]),
                              _: 1 /* STABLE */
                            }, 8 /* PROPS */, ["onClick"])
                          ]),
                          _: 1 /* STABLE */
                        })
                      ]),
                      _: 1 /* STABLE */
                    })
                  ]),
                  _: 1 /* STABLE */
                }, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue", "fullscreen"]),
                _createCommentVNode(" Profit Calculator Modal "),
                _createVNode(_component_auto_calculate_modal, { ctx: $root }, null, 8 /* PROPS */, ["ctx"]),
                _createCommentVNode(" Add/Edit Sale Modal "),
                _createVNode(_component_v_dialog, {
                  modelValue: showAddSaleModal,
                  "onUpdate:modelValue": $event => ((showAddSaleModal) = $event),
                  "max-width": "560",
                  class: "sale-editor-dialog",
                  scrollable: "",
                  fullscreen: $vuetify?.display?.smAndDown,
                  transition: "dialog-bottom-transition"
                }, {
                  default: _withCtx(() => [
                    _createVNode(_component_v_card, { class: "sale-editor-card" }, {
                      default: _withCtx(() => [
                        _createVNode(_component_v_card_title, { class: "sale-editor-title" }, {
                          default: _withCtx(() => [
                            _createElementVNode("div", { class: "d-flex align-center" }, [
                              _createVNode(_component_v_icon, { class: "mr-2" }, {
                                default: _withCtx(() => [
                                  _createTextVNode("mdi-cart-plus")
                                ]),
                                _: 1 /* STABLE */
                              }),
                              _createElementVNode("div", null, [
                                _createElementVNode("div", null, _toDisplayString(editingSale ? 'Edit Sale' : 'Add Sale'), 1 /* TEXT */),
                                _createElementVNode("div", { class: "text-caption text-medium-emphasis" }, _toDisplayString(currentLotType === 'singles' ? 'Track item-level sale details' : 'Record this sale event'), 1 /* TEXT */)
                              ])
                            ])
                          ]),
                          _: 1 /* STABLE */
                        }),
                        _createVNode(_component_v_card_text, { class: "sale-editor-content" }, {
                          default: _withCtx(() => [
                            (hasLotSelected && !hasProAccess)
                              ? (_openBlock(), _createBlock(_component_v_alert, {
                                  key: 0,
                                  type: "info",
                                  variant: "tonal",
                                  density: "compact",
                                  icon: "mdi-lock",
                                  class: "mb-3"
                                }, {
                                  default: _withCtx(() => [
                                    _createTextVNode(" Pro feature. Upgrade to add or edit sales. "),
                                    _createElementVNode("div", { class: "mt-2" }, [
                                      _createVNode(_component_v_btn, {
                                        size: "small",
                                        color: "primary",
                                        variant: "flat",
                                        "prepend-icon": "mdi-google-play",
                                        loading: isVerifyingPurchase,
                                        onClick: startProPurchase
                                      }, {
                                        default: _withCtx(() => [
                                          _createTextVNode(" Unlock Pro ")
                                        ]),
                                        _: 1 /* STABLE */
                                      }, 8 /* PROPS */, ["loading", "onClick"])
                                    ]),
                                    showManualPurchaseVerify
                                      ? (_openBlock(), _createElementBlock("div", {
                                          key: 0,
                                          class: "mt-2"
                                        }, [
                                          _createVNode(_component_v_btn, {
                                            size: "small",
                                            variant: "text",
                                            "prepend-icon": "mdi-check-decagram",
                                            onClick: openVerifyPurchaseModal
                                          }, {
                                            default: _withCtx(() => [
                                              _createTextVNode(" Verify Purchase ")
                                            ]),
                                            _: 1 /* STABLE */
                                          }, 8 /* PROPS */, ["onClick"])
                                        ]))
                                      : _createCommentVNode("v-if", true)
                                  ]),
                                  _: 1 /* STABLE */
                                }))
                              : _createCommentVNode("v-if", true),
                            _createElementVNode("div", { class: "sale-editor-form" }, [
                              (currentLotType === 'singles')
                                ? (_openBlock(), _createElementBlock("div", {
                                    key: 0,
                                    class: "sale-editor-section sale-editor-section--singles"
                                  }, [
                                    _createElementVNode("div", { class: "sale-editor-section-label" }, "Items Sold"),
                                    _createElementVNode("div", { class: "sale-editor-singles-lines" }, [
                                      (_openBlock(true), _createElementBlock(_Fragment, null, _renderList((newSale.singlesItems || []), (line, lineIndex) => {
                                        return (_openBlock(), _createElementBlock("div", {
                                          key: line.lineId || lineIndex,
                                          class: "sale-editor-singles-line"
                                        }, [
                                          _createElementVNode("div", { class: "sale-editor-line-layout" }, [
                                            (singlesSaleCardOptions.find(o => o.value === line.singlesPurchaseEntryId)?.image)
                                              ? (_openBlock(), _createElementBlock("div", {
                                                  key: 0,
                                                  class: "sale-editor-line-thumb-col"
                                                }, [
                                                  _createElementVNode("img", {
                                                    src: singlesSaleCardOptions.find(o => o.value === line.singlesPurchaseEntryId)?.image,
                                                    alt: singlesSaleCardOptions.find(o => o.value === line.singlesPurchaseEntryId)?.item,
                                                    class: "sale-editor-line-thumb",
                                                    loading: "lazy",
                                                    onError: $event => ($event.target.closest('.sale-editor-line-thumb-col').style.display='none')
                                                  }, null, 40 /* PROPS, NEED_HYDRATION */, ["src", "alt", "onError"])
                                                ]))
                                              : _createCommentVNode("v-if", true),
                                            _createElementVNode("div", { class: "sale-editor-line-fields" }, [
                                              _createVNode(_component_v_row, {
                                                dense: "",
                                                class: "sale-editor-singles-grid"
                                              }, {
                                                default: _withCtx(() => [
                                                  _createVNode(_component_v_col, { cols: $vuetify?.display?.smAndDown ? 12 : 6 }, {
                                                    default: _withCtx(() => [
                                                      _createVNode(_component_v_autocomplete, {
                                                        modelValue: line.singlesPurchaseEntryId,
                                                        "onUpdate:modelValue": [$event => ((line.singlesPurchaseEntryId) = $event), $event => (onSinglesSaleLineCardSelectionChange(lineIndex, $event))],
                                                        items: singlesSaleCardOptions,
                                                        "item-title": "title",
                                                        "item-value": "value",
                                                        label: "Item (optional)",
                                                        variant: "outlined",
                                                        density: "compact",
                                                        disabled: !hasLotSelected,
                                                        clearable: "",
                                                        "hide-details": "auto"
                                                      }, {
                                                        item: _withCtx(({ props, item }) => [
                                                          _createVNode(_component_v_list_item, _mergeProps({ ref_for: true }, props, { class: "sale-editor-dropdown-item" }), _createSlots({
                                                            default: _withCtx(() => [
                                                              _createVNode(_component_v_list_item_title, { class: "text-body-2 font-weight-medium" }, {
                                                                default: _withCtx(() => [
                                                                  _createTextVNode(_toDisplayString(item.raw.item) + " ", 1 /* TEXT */),
                                                                  (item.raw.cardNumber)
                                                                    ? (_openBlock(), _createElementBlock("span", {
                                                                        key: 0,
                                                                        class: "text-medium-emphasis"
                                                                      }, "#" + _toDisplayString(item.raw.cardNumber), 1 /* TEXT */))
                                                                    : _createCommentVNode("v-if", true)
                                                                ]),
                                                                _: 2 /* DYNAMIC */
                                                              }, 1024 /* DYNAMIC_SLOTS */),
                                                              _createVNode(_component_v_list_item_subtitle, { class: "text-caption" }, {
                                                                default: _withCtx(() => [
                                                                  _createTextVNode(" Qty " + _toDisplayString(item.raw.quantity) + " · Total Cost $" + _toDisplayString(formatCurrency(item.raw.costBasis)), 1 /* TEXT */)
                                                                ]),
                                                                _: 2 /* DYNAMIC */
                                                              }, 1024 /* DYNAMIC_SLOTS */)
                                                            ]),
                                                            _: 2 /* DYNAMIC */
                                                          }, [
                                                            (item.raw.image)
                                                              ? {
                                                                  name: "prepend",
                                                                  fn: _withCtx(() => [
                                                                    _createElementVNode("img", {
                                                                      src: item.raw.image,
                                                                      alt: item.raw.item,
                                                                      class: "sale-editor-dropdown-thumb",
                                                                      loading: "lazy",
                                                                      onError: $event => ($event.target.style.display='none')
                                                                    }, null, 40 /* PROPS, NEED_HYDRATION */, ["src", "alt", "onError"])
                                                                  ]),
                                                                  key: "0"
                                                                }
                                                              : undefined
                                                          ]), 1040 /* FULL_PROPS, DYNAMIC_SLOTS */)
                                                        ]),
                                                        selection: _withCtx(({ item }) => [
                                                          _createElementVNode("div", { class: "text-body-2 text-truncate" }, [
                                                            _createTextVNode(_toDisplayString(item.raw.item) + " ", 1 /* TEXT */),
                                                            (item.raw.cardNumber)
                                                              ? (_openBlock(), _createElementBlock("span", {
                                                                  key: 0,
                                                                  class: "text-medium-emphasis"
                                                                }, "#" + _toDisplayString(item.raw.cardNumber), 1 /* TEXT */))
                                                              : _createCommentVNode("v-if", true)
                                                          ])
                                                        ]),
                                                        _: 2 /* DYNAMIC */
                                                      }, 1032 /* PROPS, DYNAMIC_SLOTS */, ["modelValue", "onUpdate:modelValue", "items", "disabled"])
                                                    ]),
                                                    _: 2 /* DYNAMIC */
                                                  }, 1032 /* PROPS, DYNAMIC_SLOTS */, ["cols"]),
                                                  _createVNode(_component_v_col, { cols: $vuetify?.display?.smAndDown ? 5 : 2 }, {
                                                    default: _withCtx(() => [
                                                      _createVNode(_component_v_text_field, {
                                                        modelValue: line.quantity,
                                                        "onUpdate:modelValue": [$event => ((line.quantity) = $event), $event => (onSinglesSaleLineQuantityChange(lineIndex, $event))],
                                                        modelModifiers: { number: true },
                                                        label: "Qty",
                                                        type: "number",
                                                        variant: "outlined",
                                                        density: "compact",
                                                        disabled: !hasLotSelected,
                                                        min: 1,
                                                        max: line.singlesPurchaseEntryId ? (getSinglesSaleLineMaxQuantity(lineIndex) ?? undefined) : undefined,
                                                        "hide-details": "auto"
                                                      }, null, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue", "disabled", "min", "max"])
                                                    ]),
                                                    _: 2 /* DYNAMIC */
                                                  }, 1032 /* PROPS, DYNAMIC_SLOTS */, ["cols"]),
                                                  _createVNode(_component_v_col, { cols: $vuetify?.display?.smAndDown ? 5 : 3 }, {
                                                    default: _withCtx(() => [
                                                      _createVNode(_component_v_text_field, {
                                                        modelValue: line.price,
                                                        "onUpdate:modelValue": [$event => ((line.price) = $event), onSinglesSaleLinePriceChange],
                                                        modelModifiers: { number: true },
                                                        label: "Total",
                                                        type: "number",
                                                        variant: "outlined",
                                                        density: "compact",
                                                        disabled: !hasLotSelected,
                                                        prefix: "$",
                                                        "hide-details": "auto"
                                                      }, null, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue", "disabled"])
                                                    ]),
                                                    _: 2 /* DYNAMIC */
                                                  }, 1032 /* PROPS, DYNAMIC_SLOTS */, ["cols"]),
                                                  ((newSale.singlesItems?.length || 0) > 1)
                                                    ? (_openBlock(), _createBlock(_component_v_col, {
                                                        key: 0,
                                                        cols: $vuetify?.display?.smAndDown ? 2 : 1,
                                                        class: "d-flex align-center justify-end"
                                                      }, {
                                                        default: _withCtx(() => [
                                                          _createVNode(_component_v_btn, {
                                                            icon: "",
                                                            size: "small",
                                                            variant: "text",
                                                            color: "error",
                                                            class: "sale-editor-singles-line-delete",
                                                            title: "Remove line",
                                                            "aria-label": "Remove line",
                                                            onClick: $event => (removeSinglesSaleLine(lineIndex))
                                                          }, {
                                                            default: _withCtx(() => [
                                                              _createVNode(_component_v_icon, { size: "18" }, {
                                                                default: _withCtx(() => [
                                                                  _createTextVNode("mdi-trash-can-outline")
                                                                ]),
                                                                _: 2 /* DYNAMIC */
                                                              }, 1024 /* DYNAMIC_SLOTS */)
                                                            ]),
                                                            _: 2 /* DYNAMIC */
                                                          }, 1032 /* PROPS, DYNAMIC_SLOTS */, ["onClick"])
                                                        ]),
                                                        _: 2 /* DYNAMIC */
                                                      }, 1032 /* PROPS, DYNAMIC_SLOTS */, ["cols"]))
                                                    : _createCommentVNode("v-if", true)
                                                ]),
                                                _: 2 /* DYNAMIC */
                                              }, 1024 /* DYNAMIC_SLOTS */)
                                            ])
                                          ]),
                                          _createElementVNode("div", { class: "sale-editor-singles-meta" }, [
                                            (line.singlesPurchaseEntryId || Number(line.price || 0) <= 0)
                                              ? (_openBlock(), _createElementBlock("div", {
                                                  key: 0,
                                                  class: "sale-editor-singles-stock text-caption text-medium-emphasis"
                                                }, _toDisplayString(line.singlesPurchaseEntryId
                          ? `Up to ${getSinglesSaleLineMaxQuantity(lineIndex) ?? 0} available`
                          : 'Unlinked line requires a total price.'), 1 /* TEXT */))
                                              : _createCommentVNode("v-if", true),
                                            (
                          (line.singlesPurchaseEntryId || Number(line.price || 0) > 0)
                          && saleEditorLineProfitPreviews
                          && saleEditorLineProfitPreviews[lineIndex]
                        )
                                              ? (_openBlock(), _createElementBlock("div", {
                                                  key: 1,
                                                  class: _normalizeClass(["sale-editor-singles-profit-pill text-caption", saleEditorLineProfitPreviews[lineIndex].colorClass])
                                                }, [
                                                  _createTextVNode(_toDisplayString(saleEditorLineProfitPreviews[lineIndex].sign) + "$" + _toDisplayString(formatCurrency(Math.abs(saleEditorLineProfitPreviews[lineIndex].value))) + " · " + _toDisplayString(saleEditorLineProfitPreviews[lineIndex].sign) + _toDisplayString(formatCurrency(Math.abs(saleEditorLineProfitPreviews[lineIndex].percent), 1)) + "% ", 1 /* TEXT */),
                                                  ((saleEditorLineProfitPreviews[lineIndex].quantity || 0) > 1 && saleEditorLineProfitPreviews[lineIndex].unitValue != null)
                                                    ? (_openBlock(), _createElementBlock("span", { key: 0 }, " · /unit " + _toDisplayString(saleEditorLineProfitPreviews[lineIndex].sign) + "$" + _toDisplayString(formatCurrency(Math.abs(saleEditorLineProfitPreviews[lineIndex].unitValue))), 1 /* TEXT */))
                                                    : _createCommentVNode("v-if", true)
                                                ], 2 /* CLASS */))
                                              : _createCommentVNode("v-if", true)
                                          ])
                                        ]))
                                      }), 128 /* KEYED_FRAGMENT */))
                                    ]),
                                    _createElementVNode("div", { class: "sale-editor-singles-footer" }, [
                                      saleEditorProfitPreview
                                        ? (_openBlock(), _createElementBlock("div", {
                                            key: 0,
                                            class: _normalizeClass(["sale-editor-singles-total text-caption", saleEditorProfitPreview.colorClass])
                                          }, [
                                            _createElementVNode("div", { class: "sale-editor-singles-total-main" }, [
                                              _createElementVNode("span", { class: "sale-editor-singles-total-pill" }, "Total $" + _toDisplayString(formatCurrency(saleEditorProfitPreview.totalPrice)), 1 /* TEXT */),
                                              _createElementVNode("span", { class: "sale-editor-singles-total-pill" }, "Profit " + _toDisplayString(saleEditorProfitPreview.sign) + "$" + _toDisplayString(formatCurrency(Math.abs(saleEditorProfitPreview.value))), 1 /* TEXT */),
                                              _createElementVNode("span", { class: "sale-editor-singles-total-pill sale-editor-singles-total-pill--muted" }, _toDisplayString(saleEditorProfitPreview.sign) + _toDisplayString(formatCurrency(Math.abs(saleEditorProfitPreview.percent), 1)) + "% vs " + _toDisplayString(saleEditorProfitPreview.basisLabel) + " $" + _toDisplayString(formatCurrency(saleEditorProfitPreview.basisValue)), 1 /* TEXT */),
                                              (saleEditorProfitPreview.marketBasisValue > 0 && saleEditorProfitPreview.costBasisValue > 0)
                                                ? (_openBlock(), _createElementBlock("span", {
                                                    key: 0,
                                                    class: "sale-editor-singles-total-pill sale-editor-singles-total-pill--muted"
                                                  }, " Market $" + _toDisplayString(formatCurrency(saleEditorProfitPreview.marketBasisValue)) + " · Cost $" + _toDisplayString(formatCurrency(saleEditorProfitPreview.costBasisValue)), 1 /* TEXT */))
                                                : _createCommentVNode("v-if", true)
                                            ]),
                                            ((saleEditorProfitPreview.quantity || 0) > 1 && saleEditorProfitPreview.unitValue != null)
                                              ? (_openBlock(), _createElementBlock("div", {
                                                  key: 0,
                                                  class: "sale-editor-singles-total-sub"
                                                }, " Per unit " + _toDisplayString(saleEditorProfitPreview.sign) + "$" + _toDisplayString(formatCurrency(Math.abs(saleEditorProfitPreview.unitValue))), 1 /* TEXT */))
                                              : _createCommentVNode("v-if", true)
                                          ], 2 /* CLASS */))
                                        : _createCommentVNode("v-if", true),
                                      _createElementVNode("div", { class: "sale-editor-singles-add-wrap" }, [
                                        _createVNode(_component_v_btn, {
                                          size: "small",
                                          variant: "tonal",
                                          color: "secondary",
                                          "prepend-icon": "mdi-plus-circle-outline",
                                          class: "sale-editor-singles-add-btn",
                                          onClick: addSinglesSaleLine
                                        }, {
                                          default: _withCtx(() => [
                                            _createTextVNode(" Add item ")
                                          ]),
                                          _: 1 /* STABLE */
                                        }, 8 /* PROPS */, ["onClick"])
                                      ])
                                    ])
                                  ]))
                                : _createCommentVNode("v-if", true),
                              (currentLotType !== 'singles')
                                ? (_openBlock(), _createElementBlock("div", {
                                    key: 1,
                                    class: "sale-editor-section"
                                  }, [
                                    _createElementVNode("div", { class: "sale-editor-section-label" }, "Sale Details"),
                                    _createVNode(_component_v_row, { dense: "" }, {
                                      default: _withCtx(() => [
                                        _createVNode(_component_v_col, {
                                          cols: "12",
                                          sm: "6"
                                        }, {
                                          default: _withCtx(() => [
                                            _createVNode(_component_v_select, {
                                              modelValue: newSale.type,
                                              "onUpdate:modelValue": [$event => ((newSale.type) = $event), onNewSaleTypeChange],
                                              items: [
                        { title: 'Item', value: 'pack' },
                        { title: 'Box', value: 'box' },
                        { title: 'RTYH Spot', value: 'rtyh' }
                      ],
                                              label: "Sale Type",
                                              variant: "outlined",
                                              disabled: !hasLotSelected,
                                              "hide-details": "auto"
                                            }, null, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue", "items", "disabled"])
                                          ]),
                                          _: 1 /* STABLE */
                                        }),
                                        _createVNode(_component_v_col, {
                                          cols: "12",
                                          sm: "6"
                                        }, {
                                          default: _withCtx(() => [
                                            _createVNode(_component_v_text_field, {
                                              ref: "saleQuantityInput",
                                              modelValue: newSale.quantity,
                                              "onUpdate:modelValue": $event => ((newSale.quantity) = $event),
                                              modelModifiers: { number: true },
                                              label: "Quantity",
                                              type: "number",
                                              variant: "outlined",
                                              disabled: !hasLotSelected,
                                              min: 1,
                                              "hide-details": "auto"
                                            }, null, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue", "disabled", "min"])
                                          ]),
                                          _: 1 /* STABLE */
                                        }),
                                        _createVNode(_component_v_col, {
                                          cols: "12",
                                          sm: "6"
                                        }, {
                                          default: _withCtx(() => [
                                            _createVNode(_component_v_text_field, {
                                              modelValue: newSale.price,
                                              "onUpdate:modelValue": $event => ((newSale.price) = $event),
                                              modelModifiers: { number: true },
                                              label: "Price per Unit",
                                              type: "number",
                                              variant: "outlined",
                                              disabled: !hasLotSelected,
                                              prefix: "$",
                                              "hide-details": "auto"
                                            }, null, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue", "disabled"])
                                          ]),
                                          _: 1 /* STABLE */
                                        }),
                                        (newSale.type === 'rtyh')
                                          ? (_openBlock(), _createBlock(_component_v_col, {
                                              key: 0,
                                              cols: "12",
                                              sm: "6"
                                            }, {
                                              default: _withCtx(() => [
                                                _createVNode(_component_v_text_field, {
                                                  modelValue: newSale.packsCount,
                                                  "onUpdate:modelValue": $event => ((newSale.packsCount) = $event),
                                                  modelModifiers: { number: true },
                                                  label: "Items Sold (RTYH)",
                                                  type: "number",
                                                  variant: "outlined",
                                                  disabled: !hasLotSelected,
                                                  min: 1,
                                                  rules: [v => !!v || 'Required for RTYH'],
                                                  "hide-details": "auto"
                                                }, null, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue", "disabled", "min", "rules"])
                                              ]),
                                              _: 1 /* STABLE */
                                            }))
                                          : _createCommentVNode("v-if", true)
                                      ]),
                                      _: 1 /* STABLE */
                                    })
                                  ]))
                                : _createCommentVNode("v-if", true),
                              _createElementVNode("div", { class: "sale-editor-section" }, [
                                _createElementVNode("div", { class: "sale-editor-section-label" }, "Notes & Delivery"),
                                _createVNode(_component_v_row, { dense: "" }, {
                                  default: _withCtx(() => [
                                    _createVNode(_component_v_col, {
                                      cols: "12",
                                      sm: "6"
                                    }, {
                                      default: _withCtx(() => [
                                        _createVNode(_component_v_text_field, {
                                          modelValue: newSale.buyerShipping,
                                          "onUpdate:modelValue": $event => ((newSale.buyerShipping) = $event),
                                          modelModifiers: { number: true },
                                          label: "Buyer Shipping (per order)",
                                          type: "number",
                                          variant: "outlined",
                                          disabled: !hasLotSelected,
                                          prefix: "$",
                                          min: 0,
                                          "hide-details": "auto"
                                        }, null, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue", "disabled", "min"])
                                      ]),
                                      _: 1 /* STABLE */
                                    }),
                                    _createVNode(_component_v_col, {
                                      cols: "12",
                                      sm: "6"
                                    }, {
                                      default: _withCtx(() => [
                                        _createVNode(_component_v_text_field, {
                                          modelValue: newSale.date,
                                          "onUpdate:modelValue": $event => ((newSale.date) = $event),
                                          label: "Date",
                                          type: "date",
                                          variant: "outlined",
                                          disabled: !hasLotSelected,
                                          "hide-details": "auto"
                                        }, null, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue", "disabled"])
                                      ]),
                                      _: 1 /* STABLE */
                                    }),
                                    _createVNode(_component_v_col, { cols: "12" }, {
                                      default: _withCtx(() => [
                                        _createVNode(_component_v_text_field, {
                                          modelValue: newSale.memo,
                                          "onUpdate:modelValue": $event => ((newSale.memo) = $event),
                                          label: "Notes",
                                          variant: "outlined",
                                          disabled: !hasLotSelected,
                                          "hide-details": ""
                                        }, null, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue", "disabled"])
                                      ]),
                                      _: 1 /* STABLE */
                                    })
                                  ]),
                                  _: 1 /* STABLE */
                                })
                              ])
                            ])
                          ]),
                          _: 1 /* STABLE */
                        }),
                        _createVNode(_component_v_card_actions, { class: "sale-editor-actions" }, {
                          default: _withCtx(() => [
                            _createVNode(_component_v_spacer),
                            _createVNode(_component_v_btn, {
                              text: "",
                              onClick: cancelSale
                            }, {
                              default: _withCtx(() => [
                                _createTextVNode("Cancel")
                              ]),
                              _: 1 /* STABLE */
                            }, 8 /* PROPS */, ["onClick"]),
                            _createVNode(_component_v_btn, {
                              color: "primary",
                              onClick: saveSale,
                              disabled: !canUsePaidActions
                            }, {
                              default: _withCtx(() => [
                                _createTextVNode(_toDisplayString(editingSale ? 'Update' : 'Add'), 1 /* TEXT */)
                              ]),
                              _: 1 /* STABLE */
                            }, 8 /* PROPS */, ["onClick", "disabled"])
                          ]),
                          _: 1 /* STABLE */
                        })
                      ]),
                      _: 1 /* STABLE */
                    })
                  ]),
                  _: 1 /* STABLE */
                }, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue", "fullscreen"]),
                _createCommentVNode(" Portfolio Report Modal "),
                _createVNode(_component_v_dialog, {
                  modelValue: showPortfolioReportModal,
                  "onUpdate:modelValue": $event => ((showPortfolioReportModal) = $event),
                  "max-width": "980",
                  scrollable: "",
                  "content-class": "portfolio-report-dialog"
                }, {
                  default: _withCtx(() => [
                    _createVNode(_component_v_card, { class: "portfolio-report-modal-card" }, {
                      default: _withCtx(() => [
                        _createVNode(_component_v_card_title, { class: "d-flex align-center justify-space-between" }, {
                          default: _withCtx(() => [
                            _createElementVNode("div", null, [
                              _createVNode(_component_v_icon, { class: "mr-2" }, {
                                default: _withCtx(() => [
                                  _createTextVNode("mdi-table")
                                ]),
                                _: 1 /* STABLE */
                              }),
                              _createTextVNode(" Portfolio Report ")
                            ]),
                            _createVNode(_component_v_btn, {
                              icon: "mdi-close",
                              variant: "text",
                              title: "Close report",
                              "aria-label": "Close report",
                              onClick: $event => (showPortfolioReportModal = false)
                            }, null, 8 /* PROPS */, ["onClick"])
                          ]),
                          _: 1 /* STABLE */
                        }),
                        _createVNode(_component_v_divider),
                        _createVNode(_component_v_card_text, { class: "portfolio-report-content" }, {
                          default: _withCtx(() => [
                            _createElementVNode("div", { class: "text-medium-emphasis mb-4" }, " Data analysis on " + _toDisplayString(formatDate(new Date().toISOString())), 1 /* TEXT */),
                            ($vuetify?.display?.lgAndUp)
                              ? (_openBlock(), _createElementBlock("div", {
                                  key: 0,
                                  style: {"overflow-x":"auto"}
                                }, [
                                  _createElementVNode("table", { class: "portfolio-report-table" }, [
                                    _createElementVNode("thead", null, [
                                      _createElementVNode("tr", null, [
                                        _createElementVNode("th", null, "Lot"),
                                        _createElementVNode("th", null, "Type"),
                                        _createElementVNode("th", null, "Realized Status"),
                                        _createElementVNode("th", null, "Sales"),
                                        _createElementVNode("th", null, "Sold Items"),
                                        _createElementVNode("th", null, "Total Items"),
                                        _createElementVNode("th", null, "Sold Revenue"),
                                        _createElementVNode("th", null, "Sold Cost"),
                                        _createElementVNode("th", null, "Realized P/L"),
                                        _createElementVNode("th", null, "Current Lot P/L"),
                                        _createElementVNode("th", null, "Sold Margin %"),
                                        _createElementVNode("th", null, "Forecast Avg"),
                                        _createElementVNode("th", null, "Last Sale")
                                      ])
                                    ]),
                                    _createElementVNode("tbody", null, [
                                      (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(allLotPerformance, (row) => {
                                        return (_openBlock(), _createElementBlock("tr", { key: `report-${row.lotId}` }, [
                                          _createElementVNode("td", null, _toDisplayString(row.lotName), 1 /* TEXT */),
                                          _createElementVNode("td", null, _toDisplayString(row.lotType), 1 /* TEXT */),
                                          _createElementVNode("td", null, _toDisplayString(row.salesCount > 0 ? 'Realized sales' : 'No sales yet'), 1 /* TEXT */),
                                          _createElementVNode("td", null, _toDisplayString(row.salesCount), 1 /* TEXT */),
                                          _createElementVNode("td", null, _toDisplayString(row.soldPacks), 1 /* TEXT */),
                                          _createElementVNode("td", null, _toDisplayString(row.totalPacks), 1 /* TEXT */),
                                          _createElementVNode("td", null, "$" + _toDisplayString(formatCurrency(row.totalRevenue)), 1 /* TEXT */),
                                          _createElementVNode("td", null, _toDisplayString(row.salesCount > 0 ? `$${formatCurrency(row.realizedCost ?? 0)}` : '-'), 1 /* TEXT */),
                                          _createElementVNode("td", null, _toDisplayString(row.salesCount > 0 ? `${(row.realizedProfit ?? 0) >= 0 ? '+' :
                        ''}$${formatCurrency(row.realizedProfit ?? 0)}` : 'No realized P/L yet'), 1 /* TEXT */),
                                          _createElementVNode("td", null, _toDisplayString(row.totalProfit >= 0 ? '+' : '') + "$" + _toDisplayString(formatCurrency(row.totalProfit)), 1 /* TEXT */),
                                          _createElementVNode("td", null, _toDisplayString(row.salesCount > 0 && row.realizedMarginPercent != null ?
                        `${formatCurrency(row.realizedMarginPercent, 2)}%` : '-'), 1 /* TEXT */),
                                          _createElementVNode("td", null, _toDisplayString(row.forecastProfitAverage == null ? '-' : `${row.forecastProfitAverage >= 0 ? '+' :
                        ''}$${formatCurrency(row.forecastProfitAverage)}`), 1 /* TEXT */),
                                          _createElementVNode("td", null, _toDisplayString(row.lastSaleDate ? formatDate(row.lastSaleDate) : '-'), 1 /* TEXT */)
                                        ]))
                                      }), 128 /* KEYED_FRAGMENT */))
                                    ])
                                  ])
                                ]))
                              : (_openBlock(), _createElementBlock("div", {
                                  key: 1,
                                  class: "portfolio-report-card-grid"
                                }, [
                                  (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(allLotPerformance, (row) => {
                                    return (_openBlock(), _createElementBlock("article", {
                                      key: `report-card-${row.lotId}`,
                                      class: _normalizeClass(["portfolio-report-card", { 'is-expanded': portfolioReportExpandedLotIds.includes(row.lotId) }]),
                                      role: "button",
                                      tabindex: "0",
                                      "aria-expanded": portfolioReportExpandedLotIds.includes(row.lotId),
                                      "aria-controls": `portfolio-report-details-${row.lotId}`,
                                      "aria-label": `${row.lotName} report details`,
                                      onClick: $event => (togglePortfolioReportLot(row.lotId)),
                                      onKeydown: [
                                        _withKeys(_withModifiers($event => (togglePortfolioReportLot(row.lotId)), ["prevent"]), ["enter"]),
                                        _withKeys(_withModifiers($event => (togglePortfolioReportLot(row.lotId)), ["prevent"]), ["space"])
                                      ]
                                    }, [
                                      _createElementVNode("div", { class: "portfolio-report-card-head" }, [
                                        _createElementVNode("div", { class: "portfolio-report-card-title-wrap" }, [
                                          _createElementVNode("div", { class: "portfolio-report-card-title" }, [
                                            _createVNode(_component_v_icon, {
                                              size: "18",
                                              class: "portfolio-report-card-type-icon"
                                            }, {
                                              default: _withCtx(() => [
                                                _createTextVNode(_toDisplayString(row.lotType === 'Singles' ? 'mdi-cards-outline' : 'mdi-cube-outline'), 1 /* TEXT */)
                                              ]),
                                              _: 2 /* DYNAMIC */
                                            }, 1024 /* DYNAMIC_SLOTS */),
                                            _createElementVNode("span", null, _toDisplayString(row.lotName), 1 /* TEXT */)
                                          ])
                                        ]),
                                        _createVNode(_component_v_btn, {
                                          icon: "",
                                          variant: "text",
                                          size: "small",
                                          class: "portfolio-report-card-toggle",
                                          title: portfolioReportExpandedLotIds.includes(row.lotId) ? 'Hide report details' : 'Show report details',
                                          "aria-label": portfolioReportExpandedLotIds.includes(row.lotId) ? 'Hide report details' : 'Show report details',
                                          "aria-expanded": portfolioReportExpandedLotIds.includes(row.lotId),
                                          "aria-controls": `portfolio-report-details-${row.lotId}`,
                                          onClick: _withModifiers($event => (togglePortfolioReportLot(row.lotId)), ["stop"])
                                        }, {
                                          default: _withCtx(() => [
                                            _createVNode(_component_v_icon, null, {
                                              default: _withCtx(() => [
                                                _createTextVNode(_toDisplayString(portfolioReportExpandedLotIds.includes(row.lotId) ? 'mdi-chevron-up' : 'mdi-chevron-down'), 1 /* TEXT */)
                                              ]),
                                              _: 2 /* DYNAMIC */
                                            }, 1024 /* DYNAMIC_SLOTS */)
                                          ]),
                                          _: 2 /* DYNAMIC */
                                        }, 1032 /* PROPS, DYNAMIC_SLOTS */, ["title", "aria-label", "aria-expanded", "aria-controls", "onClick"])
                                      ]),
                                      _createElementVNode("div", { class: "portfolio-report-card-summary" }, [
                                        _createElementVNode("div", { class: "portfolio-report-card-metric" }, [
                                          _createElementVNode("span", { class: "portfolio-report-card-label" }, "Realized P/L"),
                                          _createElementVNode("span", {
                                            class: _normalizeClass(["portfolio-report-card-value", row.salesCount > 0
                          ? ((row.realizedProfit ?? 0) >= 0 ? 'is-positive' : 'is-negative')
                          : 'is-neutral'])
                                          }, _toDisplayString(row.salesCount > 0
                        ? `${(row.realizedProfit ?? 0) >= 0 ? '+' : ''}$${formatCurrency(row.realizedProfit ?? 0)}`
                        : 'No realized P/L'), 3 /* TEXT, CLASS */)
                                        ]),
                                        _createElementVNode("div", { class: "portfolio-report-card-metric" }, [
                                          _createElementVNode("span", { class: "portfolio-report-card-label" }, "Current Lot P/L"),
                                          _createElementVNode("span", {
                                            class: _normalizeClass(["portfolio-report-card-value", row.totalProfit >= 0 ? 'is-positive' : 'is-negative'])
                                          }, _toDisplayString(row.totalProfit >= 0 ? '+' : '') + "$" + _toDisplayString(formatCurrency(row.totalProfit)), 3 /* TEXT, CLASS */)
                                        ])
                                      ]),
                                      (portfolioReportExpandedLotIds.includes(row.lotId))
                                        ? (_openBlock(), _createElementBlock("div", {
                                            key: 0,
                                            id: `portfolio-report-details-${row.lotId}`,
                                            class: "portfolio-report-card-details"
                                          }, [
                                            _createElementVNode("div", { class: "portfolio-report-card-metrics" }, [
                                              _createElementVNode("div", { class: "portfolio-report-card-metric" }, [
                                                _createElementVNode("span", { class: "portfolio-report-card-label" }, "Status"),
                                                _createElementVNode("span", { class: "portfolio-report-card-value is-neutral" }, _toDisplayString(row.salesCount > 0 ? 'Realized sales' : 'No sales yet'), 1 /* TEXT */)
                                              ]),
                                              _createElementVNode("div", { class: "portfolio-report-card-metric" }, [
                                                _createElementVNode("span", { class: "portfolio-report-card-label" }, "Sales"),
                                                _createElementVNode("span", { class: "portfolio-report-card-value" }, _toDisplayString(row.salesCount), 1 /* TEXT */)
                                              ]),
                                              _createElementVNode("div", { class: "portfolio-report-card-metric" }, [
                                                _createElementVNode("span", { class: "portfolio-report-card-label" }, "Sold / Total"),
                                                _createElementVNode("span", { class: "portfolio-report-card-value" }, _toDisplayString(row.soldPacks) + " / " + _toDisplayString(row.totalPacks), 1 /* TEXT */)
                                              ]),
                                              _createElementVNode("div", { class: "portfolio-report-card-metric" }, [
                                                _createElementVNode("span", { class: "portfolio-report-card-label" }, "Sold Revenue"),
                                                _createElementVNode("span", { class: "portfolio-report-card-value" }, "$" + _toDisplayString(formatCurrency(row.totalRevenue)), 1 /* TEXT */)
                                              ]),
                                              _createElementVNode("div", { class: "portfolio-report-card-metric" }, [
                                                _createElementVNode("span", { class: "portfolio-report-card-label" }, "Sold Cost"),
                                                _createElementVNode("span", { class: "portfolio-report-card-value" }, _toDisplayString(row.salesCount > 0 ? `$${formatCurrency(row.realizedCost ?? 0)}` : '-'), 1 /* TEXT */)
                                              ]),
                                              _createElementVNode("div", { class: "portfolio-report-card-metric" }, [
                                                _createElementVNode("span", { class: "portfolio-report-card-label" }, "Sold Margin"),
                                                _createElementVNode("span", { class: "portfolio-report-card-value" }, _toDisplayString(row.salesCount > 0 && row.realizedMarginPercent != null
                          ? `${formatCurrency(row.realizedMarginPercent, 2)}%`
                          : '-'), 1 /* TEXT */)
                                              ]),
                                              (row.forecastProfitAverage != null)
                                                ? (_openBlock(), _createElementBlock("div", {
                                                    key: 0,
                                                    class: "portfolio-report-card-metric"
                                                  }, [
                                                    _createElementVNode("span", { class: "portfolio-report-card-label" }, "Forecast Avg"),
                                                    _createElementVNode("span", {
                                                      class: _normalizeClass(["portfolio-report-card-value", row.forecastProfitAverage >= 0 ? 'is-positive' : 'is-negative'])
                                                    }, _toDisplayString(`${row.forecastProfitAverage >= 0 ? '+' : ''}$${formatCurrency(row.forecastProfitAverage)}`), 3 /* TEXT, CLASS */)
                                                  ]))
                                                : _createCommentVNode("v-if", true),
                                              _createElementVNode("div", { class: "portfolio-report-card-metric portfolio-report-card-metric--full" }, [
                                                _createElementVNode("span", { class: "portfolio-report-card-label" }, "Last Sale"),
                                                _createElementVNode("span", { class: "portfolio-report-card-value" }, _toDisplayString(row.lastSaleDate ? formatDate(row.lastSaleDate) : '-'), 1 /* TEXT */)
                                              ])
                                            ])
                                          ], 8 /* PROPS */, ["id"]))
                                        : _createCommentVNode("v-if", true)
                                    ], 42 /* CLASS, PROPS, NEED_HYDRATION */, ["aria-expanded", "aria-controls", "aria-label", "onClick", "onKeydown"]))
                                  }), 128 /* KEYED_FRAGMENT */))
                                ]))
                          ]),
                          _: 1 /* STABLE */
                        }),
                        _createVNode(_component_v_card_actions, { class: "justify-space-between portfolio-report-actions" }, {
                          default: _withCtx(() => [
                            _createVNode(_component_v_btn, {
                              variant: "text",
                              onClick: $event => (showPortfolioReportModal = false)
                            }, {
                              default: _withCtx(() => [
                                _createTextVNode("Close")
                              ]),
                              _: 1 /* STABLE */
                            }, 8 /* PROPS */, ["onClick"]),
                            _createElementVNode("div", { class: "d-flex align-center ga-2" }, [
                              _createVNode(_component_v_btn, {
                                variant: "text",
                                "prepend-icon": "mdi-content-copy",
                                disabled: !hasPortfolioData,
                                onClick: copyPortfolioReportTable
                              }, {
                                default: _withCtx(() => [
                                  _createTextVNode(" Copy ")
                                ]),
                                _: 1 /* STABLE */
                              }, 8 /* PROPS */, ["disabled", "onClick"]),
                              _createVNode(_component_v_btn, {
                                color: "error",
                                "prepend-icon": "mdi-content-save-outline",
                                disabled: !hasPortfolioData,
                                onClick: savePortfolioReportTable
                              }, {
                                default: _withCtx(() => [
                                  _createTextVNode(" Save ")
                                ]),
                                _: 1 /* STABLE */
                              }, 8 /* PROPS */, ["disabled", "onClick"])
                            ])
                          ]),
                          _: 1 /* STABLE */
                        })
                      ]),
                      _: 1 /* STABLE */
                    })
                  ]),
                  _: 1 /* STABLE */
                }, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue"]),
                _createVNode(_component_v_dialog, {
                  modelValue: confirmDialog,
                  "onUpdate:modelValue": $event => ((confirmDialog) = $event),
                  "max-width": "420"
                }, {
                  default: _withCtx(() => [
                    _createVNode(_component_v_card, null, {
                      default: _withCtx(() => [
                        _createVNode(_component_v_card_title, null, {
                          default: _withCtx(() => [
                            _createTextVNode(_toDisplayString(confirmTitle), 1 /* TEXT */)
                          ]),
                          _: 1 /* STABLE */
                        }),
                        _createVNode(_component_v_card_text, null, {
                          default: _withCtx(() => [
                            _createTextVNode(_toDisplayString(confirmText), 1 /* TEXT */)
                          ]),
                          _: 1 /* STABLE */
                        }),
                        _createVNode(_component_v_card_actions, null, {
                          default: _withCtx(() => [
                            _createVNode(_component_v_spacer),
                            _createVNode(_component_v_btn, {
                              variant: "text",
                              onClick: cancelConfirmAction
                            }, {
                              default: _withCtx(() => [
                                _createTextVNode("Cancel")
                              ]),
                              _: 1 /* STABLE */
                            }, 8 /* PROPS */, ["onClick"]),
                            _createVNode(_component_v_btn, {
                              color: confirmColor,
                              onClick: runConfirmAction
                            }, {
                              default: _withCtx(() => [
                                _createTextVNode("Confirm")
                              ]),
                              _: 1 /* STABLE */
                            }, 8 /* PROPS */, ["color", "onClick"])
                          ]),
                          _: 1 /* STABLE */
                        })
                      ]),
                      _: 1 /* STABLE */
                    })
                  ]),
                  _: 1 /* STABLE */
                }, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue"]),
                _createVNode(_component_whatnot_csv_import_dialog, { ctx: this }, null, 8 /* PROPS */, ["ctx"]),
                _createVNode(_component_whatnot_review_dialog, { ctx: this }, null, 8 /* PROPS */, ["ctx"]),
                _createVNode(_component_v_snackbar, {
                  modelValue: showAppUpdatePrompt,
                  "onUpdate:modelValue": $event => ((showAppUpdatePrompt) = $event),
                  color: "secondary",
                  location: "top",
                  timeout: -1,
                  role: "status",
                  "aria-live": "polite",
                  "aria-atomic": "true",
                  "close-on-content-click": false
                }, {
                  actions: _withCtx(() => [
                    _createVNode(_component_v_btn, {
                      variant: "text",
                      onClick: dismissAppUpdate
                    }, {
                      default: _withCtx(() => [
                        _createTextVNode("Later")
                      ]),
                      _: 1 /* STABLE */
                    }, 8 /* PROPS */, ["onClick"]),
                    _createVNode(_component_v_btn, {
                      variant: "flat",
                      color: "secondary",
                      onClick: applyAppUpdate
                    }, {
                      default: _withCtx(() => [
                        _createTextVNode("Refresh")
                      ]),
                      _: 1 /* STABLE */
                    }, 8 /* PROPS */, ["onClick"])
                  ]),
                  default: _withCtx(() => [
                    _createTextVNode(" A new version of WhatFees is available. ")
                  ]),
                  _: 1 /* STABLE */
                }, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue", "timeout", "close-on-content-click"]),
                _createVNode(_component_v_snackbar, {
                  modelValue: snackbar.show,
                  "onUpdate:modelValue": $event => ((snackbar.show) = $event),
                  color: snackbar.color,
                  location: "bottom",
                  timeout: "2400",
                  role: "status",
                  "aria-live": "polite",
                  "aria-atomic": "true"
                }, {
                  default: _withCtx(() => [
                    _createTextVNode(_toDisplayString(snackbar.text), 1 /* TEXT */)
                  ]),
                  _: 1 /* STABLE */
                }, 8 /* PROPS */, ["modelValue", "onUpdate:modelValue", "color"])
              ], 64 /* STABLE_FRAGMENT */))
            : (_openBlock(), _createBlock(_component_v_main, {
                key: 1,
                id: "app-main",
                tabindex: "-1"
              }, {
                default: _withCtx(() => [
                  _createVNode(_component_v_container, {
                    fluid: "",
                    class: "auth-gate-shell"
                  }, {
                    default: _withCtx(() => [
                      _createVNode(_component_v_card, {
                        class: "auth-gate-card",
                        elevation: "8",
                        "max-width": "430"
                      }, {
                        default: _withCtx(() => [
                          _createVNode(_component_v_card_text, { class: "pa-6 pa-sm-8 text-center" }, {
                            default: _withCtx(() => [
                              _createElementVNode("img", {
                                src: "icons/icon-192.png",
                                alt: "WhatFees",
                                class: "auth-gate-logo"
                              }),
                              _createElementVNode("p", { class: "text-overline auth-gate-overline mb-2" }, "WhatFees"),
                              _createElementVNode("h1", { class: "text-h5 font-weight-bold mb-2 auth-gate-title" }, _toDisplayString(pendingWorkspaceInviteToken ? 'Sign in to join workspace' : 'Sign in to continue'), 1 /* TEXT */),
                              _createElementVNode("p", { class: "text-body-2 text-medium-emphasis mb-6" }, _toDisplayString(pendingWorkspaceInviteToken
                  ? 'Use your Google account to accept this workspace invite and keep your Personal workspace too.'
                  : 'Your lots, cloud sync, and Pro access are tied to your Google account.'), 1 /* TEXT */),
                              _createVNode(_component_v_btn, {
                                block: "",
                                size: "large",
                                color: "primary",
                                class: "auth-gate-btn",
                                onClick: promptGoogleSignIn
                              }, {
                                default: _withCtx(() => [
                                  _createElementVNode("span", { class: "auth-gate-btn__content" }, [
                                    _createVNode(_component_v_icon, {
                                      size: "22",
                                      class: "auth-gate-btn__icon"
                                    }, {
                                      default: _withCtx(() => [
                                        _createTextVNode("mdi-google")
                                      ]),
                                      _: 1 /* STABLE */
                                    }),
                                    _createElementVNode("span", { class: "auth-gate-btn__label" }, "Continue with Google"),
                                    _createElementVNode("span", {
                                      class: "auth-gate-btn__spacer",
                                      "aria-hidden": "true"
                                    })
                                  ])
                                ]),
                                _: 1 /* STABLE */
                              }, 8 /* PROPS */, ["onClick"])
                            ]),
                            _: 1 /* STABLE */
                          })
                        ]),
                        _: 1 /* STABLE */
                      })
                    ]),
                    _: 1 /* STABLE */
                  })
                ]),
                _: 1 /* STABLE */
              }))
        ]),
        _: 1 /* STABLE */
      })
    ]))
  }
}
})();
