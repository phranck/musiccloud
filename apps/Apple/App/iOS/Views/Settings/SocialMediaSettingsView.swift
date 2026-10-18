#if os(iOS)
//
//  SocialMediaSettingsView.swift
//  musiccloud
//

import SwiftUI

// MARK: - SocialMediaSettingsView

/// The Social Media screen of the iOS Settings: one section per service with
/// its connected accounts, a swipe action that disconnects one, and a row
/// that connects another.
///
/// It lists the accounts of ``SocialConnections/shared``, the same ones the
/// Share Extension posts from, and connects and disconnects them as the
/// Social Media pane on the Mac does.
struct SocialMediaSettingsView: View {
    @Environment(SocialAccountStore.self) private var store
    @State private var serviceToConnect: SocialService?

    var body: some View {
        Form { ForEach(SocialService.allCases) { service in accountSection(service) } }.navigationTitle(String(localized: "Social Media"))
            .sheet(item: $serviceToConnect) { service in ConnectAccountSheet(service: service) }
    }

    /// One service: its logo and name as the header, the connected accounts,
    /// and a button that connects another one.
    private func accountSection(_ service: SocialService) -> some View {
        let accounts = service.accounts(in: store)
        return Section {
            if accounts.isEmpty { Text("No accounts connected.").foregroundStyle(.secondary) }
            ForEach(accounts) { account in
                SocialAccountLabel(account: account)  // A full swipe would sign out at once; the button asks for a second tap.
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        Button(String(localized: "Disconnect"), systemImage: "trash", role: .destructive) {
                            Task { await account.disconnect() }
                        }
                    }
            }
            Button(String(localized: "Add Account…"), systemImage: "plus") { serviceToConnect = service }
        } header: {
            Label {
                Text(verbatim: service.name)
            } icon: {
                PostTemplateIconImage(icon: service.icon)
            }  // The name is a brand and keeps its spelling.
            .textCase(nil)
        } footer: {
            Text(service.footer)
        }
    }
}

// MARK: - ConnectAccountSheet

/// Asks for the server or handle and starts the sign-in there. The sheet
/// stays open while the browser sheet is up and closes once the account is
/// connected; a failure is shown below the field.
private struct ConnectAccountSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var model: ConnectAccountModel
    @FocusState private var isFieldFocused: Bool

    init(service: SocialService) { _model = State(initialValue: ConnectAccountModel(service: service)) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 4) {
                        // A Bluesky handle is written with an `@`, so the field shows it rather than asking for it.
                        if model.service == .bluesky { Text(verbatim: "@").foregroundStyle(.secondary) }
                        TextField(model.service.fieldLabel, text: $model.input, prompt: Text(verbatim: model.service.placeholder))
                            .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled().submitLabel(.go).focused(
                                $isFieldFocused
                            ).disabled(model.isWorking).onSubmit(connect)
                        if let suffix = model.fixedSuffix { Text(verbatim: suffix).foregroundStyle(.secondary) }
                    }
                } footer: {
                    VStack(alignment: .leading, spacing: 8) {
                        if let errorMessage = model.errorMessage { Text(errorMessage).foregroundStyle(.red) }
                        Text(model.service.sheetExplanation)
                    }
                }
            }.navigationTitle(model.service.sheetTitle).navigationBarTitleDisplayMode(.inline).toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(String(localized: "Cancel"), role: .cancel) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if model.isWorking {
                        ProgressView()
                    } else {
                        Button(String(localized: "Connect"), action: connect).disabled(!model.canConnect)
                    }
                }
            }.onAppear { isFieldFocused = true }
        }  // Closing the sheet mid sign-in would leave the browser sheet without the view that waits for it.
        .interactiveDismissDisabled(model.isWorking)
    }

    private func connect() { Task { if await model.connect() { dismiss() } } }
}

#Preview {
    let store = SocialAccountStore(directory: nil, keychain: nil)
    store.add(
        MastodonAccount(
            instance: URL(string: "https://oldbytes.space")!,
            accountID: "1",
            username: "musiccloud",
            displayName: "musiccloud",
            avatarURL: nil,
            characterLimit: 5000
        ),
        token: "preview"
    )
    return NavigationStack { SocialMediaSettingsView() }.environment(store)
}

#endif
