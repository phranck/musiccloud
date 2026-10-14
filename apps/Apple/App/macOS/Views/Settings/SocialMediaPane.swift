#if os(macOS)
//
//  SocialMediaPane.swift
//  musiccloud
//

import SwiftUI

// MARK: - SocialMediaPane

/// The Social Media pane of the Settings window: the connected Mastodon
/// accounts with avatar and handle, a fixed button below to connect another
/// one, and Disconnect in each row's context menu.
struct SocialMediaPane: View {
    @Environment(SocialAccountStore.self) private var store
    @State private var isConnecting = false
    @State private var accountToDisconnect: MastodonAccount?

    var body: some View {
        Form {
            Section {
                if store.mastodonAccounts.isEmpty {
                    Text("No accounts connected.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(store.mastodonAccounts) { account in
                        MastodonAccountRow(account: account)
                            .contextMenu {
                                Button(String(localized: "Disconnect…")) {
                                    accountToDisconnect = account
                                }
                            }
                    }
                }
            } header: {
                Label {
                    Text(verbatim: "Mastodon")
                } icon: {
                    PostTemplateIconImage(icon: .mastodon)
                }
            } footer: {
                Text("musiccloud can post to these accounts. Your password stays with your server.")
            }
        }
        .formStyle(.grouped)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            HStack {
                Spacer()
                Button(String(localized: "Connect Mastodon Account…")) {
                    isConnecting = true
                }
            }
            .padding(20)
        }
        .sheet(isPresented: $isConnecting) {
            ConnectMastodonSheet()
        }
        .confirmationDialog(
            String(localized: "Disconnect \(accountToDisconnect?.handle ?? "")?"),
            isPresented: Binding(get: { accountToDisconnect != nil }, set: { if !$0 { accountToDisconnect = nil } }),
            presenting: accountToDisconnect
        ) { account in
            Button(String(localized: "Disconnect"), role: .destructive) {
                Task { await AppDelegate.shared?.mastodonConnector.disconnect(account) }
            }
        } message: { _ in
            Text("musiccloud signs out of the account and can no longer post to it.")
        }
    }
}

// MARK: - MastodonAccountRow

/// One connected account: the avatar, the display name and the handle.
private struct MastodonAccountRow: View {
    let account: MastodonAccount

    var body: some View {
        HStack(spacing: 10) {
            AsyncImage(url: account.avatarURL) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                Image(systemName: "person.crop.circle.fill")
                    .resizable()
                    .foregroundStyle(.secondary)
            }
            .frame(width: 32, height: 32)
            .clipShape(.circle)

            VStack(alignment: .leading, spacing: 2) {
                Text(account.name)
                Text(account.handle)
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(.rect)
    }
}

// MARK: - ConnectMastodonSheet

/// Asks for the Mastodon server and starts the sign-in there. The sheet
/// stays open while the browser sheet is up and closes once the account
/// is connected; a failure is shown below the field.
private struct ConnectMastodonSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var server = ""
    @State private var isWorking = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Connect Mastodon Account")
                .font(.headline)
            Text("Enter the server your account is on. You sign in on its own page.")
                .foregroundStyle(.secondary)

            TextField(String(localized: "Server"), text: $server, prompt: Text(verbatim: "mastodon.social"))
                .textFieldStyle(.roundedBorder)
                .disabled(isWorking)
                .onSubmit(connect)

            if let errorMessage {
                Text(errorMessage)
                    .font(.callout)
                    .foregroundStyle(.red)
            }

            HStack {
                if isWorking {
                    ProgressView()
                        .controlSize(.small)
                }
                Spacer()
                Button(String(localized: "Cancel"), role: .cancel) { dismiss() }
                    .keyboardShortcut(.cancelAction)
                Button(String(localized: "Connect"), action: connect)
                    .keyboardShortcut(.defaultAction)
                    .disabled(isWorking || server.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .padding(20)
        .frame(width: 380)
    }

    private func connect() {
        guard !isWorking, let connector = AppDelegate.shared?.mastodonConnector else { return }
        isWorking = true
        errorMessage = nil
        Task {
            defer { isWorking = false }
            do {
                try await connector.connect(instanceInput: server)
                dismiss()
            } catch MastodonConnectorError.cancelled {
                // The user closed the browser sheet; the field stays as it was.
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}

#Preview {
    let store = SocialAccountStore(fileURL: nil, keychain: nil)
    store.add(MastodonAccount(instance: URL(string: "https://oldbytes.space")!, accountID: "1", username: "musiccloud",
                              displayName: "musiccloud", avatarURL: nil, characterLimit: 5000), token: "preview")
    return SocialMediaPane()
        .environment(store)
        .frame(width: 400, height: 440)
}

#endif
