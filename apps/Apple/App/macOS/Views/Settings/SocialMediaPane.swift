#if os(macOS)
//
//  SocialMediaPane.swift
//  musiccloud
//

import SwiftUI

// MARK: - SocialMediaPane

/// The Social Media pane of the Settings window: the connected Mastodon and
/// Bluesky accounts with avatar and handle, a Disconnect button at the end
/// of each row, and a fixed menu below to connect another account.
struct SocialMediaPane: View {
    @Environment(SocialAccountStore.self) private var store
    @State private var serviceToConnect: SocialService?
    @State private var accountToDisconnect: ConnectedAccount?

    var body: some View {
        Form {
            accountSection(.mastodon, accounts: store.mastodonAccounts.map(ConnectedAccount.mastodon))
            accountSection(.bluesky, accounts: store.blueskyAccounts.map(ConnectedAccount.bluesky))
        }
        .formStyle(.grouped)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            HStack {
                Spacer()
                Menu(String(localized: "Connect Account")) {
                    ForEach(SocialService.allCases) { service in
                        Button(service.name + "…") {
                            serviceToConnect = service
                        }
                    }
                }
                .fixedSize()
            }
            .padding(20)
        }
        .sheet(item: $serviceToConnect) { service in
            ConnectAccountSheet(service: service)
        }
        .confirmationDialog(
            String(localized: "Disconnect \(accountToDisconnect?.handle ?? "")?"),
            isPresented: Binding(get: { accountToDisconnect != nil }, set: { if !$0 { accountToDisconnect = nil } }),
            presenting: accountToDisconnect
        ) { account in
            Button(String(localized: "Disconnect"), role: .destructive) {
                Task { await account.disconnect() }
            }
        } message: { _ in
            Text("musiccloud signs out of the account and can no longer post to it.")
        }
    }

    private func accountSection(_ service: SocialService, accounts: [ConnectedAccount]) -> some View {
        Section {
            if accounts.isEmpty {
                Text("No accounts connected.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(accounts) { account in
                    ConnectedAccountRow(account: account) {
                        accountToDisconnect = account
                    }
                }
            }
        } header: {
            Label {
                Text(verbatim: service.name)
            } icon: {
                PostTemplateIconImage(icon: service.icon)
            }
        } footer: {
            Text(service.footer)
        }
    }
}

// MARK: - SocialService

/// The services an account can be connected for, with the wording each needs.
private enum SocialService: String, CaseIterable, Identifiable {
    case mastodon
    case bluesky

    var id: String { rawValue }

    /// The service's name, which is a brand and stays untranslated.
    var name: String {
        switch self {
        case .mastodon: "Mastodon"
        case .bluesky:  "Bluesky"
        }
    }

    var icon: PostTemplateIcon {
        switch self {
        case .mastodon: .mastodon
        case .bluesky:  .bluesky
        }
    }

    var sheetTitle: String {
        switch self {
        case .mastodon: String(localized: "Connect Mastodon Account")
        case .bluesky:  String(localized: "Connect Bluesky Account")
        }
    }

    var sheetExplanation: String {
        switch self {
        case .mastodon: String(localized: "Enter the server your account is on. You sign in on its own page.")
        case .bluesky:  String(localized: "Enter your handle. You sign in on your server's own page.")
        }
    }

    var fieldLabel: String {
        switch self {
        case .mastodon: String(localized: "Server")
        case .bluesky:  String(localized: "Handle")
        }
    }

    /// An example input, which is an address and stays untranslated.
    var placeholder: String {
        switch self {
        case .mastodon: "mastodon.social"
        case .bluesky:  "name.bsky.social"
        }
    }

    var footer: String {
        switch self {
        case .mastodon: String(localized: "musiccloud can post to these accounts. Your password stays with your server.")
        case .bluesky:  String(localized: "musiccloud can post to these accounts. Your password stays with Bluesky.")
        }
    }

    /// Signs in the account `input` names on this service.
    @MainActor
    func connect(_ input: String) async throws {
        guard let delegate = AppDelegate.shared else { return }
        switch self {
        case .mastodon: try await delegate.mastodonConnector.connect(instanceInput: input)
        case .bluesky:  try await delegate.blueskyConnector.connect(handleInput: input)
        }
    }
}

// MARK: - ConnectedAccount

/// A connected account of either service, as one row shows it.
private enum ConnectedAccount: Identifiable {
    case mastodon(MastodonAccount)
    case bluesky(BlueskyAccount)

    var id: String {
        switch self {
        case .mastodon(let account): "mastodon:\(account.id)"
        case .bluesky(let account):  "bluesky:\(account.id)"
        }
    }

    var name: String {
        switch self {
        case .mastodon(let account): account.name
        case .bluesky(let account):  account.name
        }
    }

    var handle: String {
        switch self {
        case .mastodon(let account): account.handle
        case .bluesky(let account):  account.displayHandle
        }
    }

    var avatarURL: URL? {
        switch self {
        case .mastodon(let account): account.avatarURL
        case .bluesky(let account):  account.avatarURL
        }
    }

    @MainActor
    func disconnect() async {
        guard let delegate = AppDelegate.shared else { return }
        switch self {
        case .mastodon(let account): await delegate.mastodonConnector.disconnect(account)
        case .bluesky(let account):  await delegate.blueskyConnector.disconnect(account)
        }
    }
}

// MARK: - ConnectedAccountRow

/// One connected account: the avatar, the display name and the handle,
/// with a button at the trailing edge that asks to disconnect it.
private struct ConnectedAccountRow: View {
    let account: ConnectedAccount
    /// Asks to disconnect the account; the pane confirms before it does.
    let onDisconnect: () -> Void

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

            Spacer()

            Button(String(localized: "Disconnect"), systemImage: "trash", action: onDisconnect)
                .labelStyle(.iconOnly)
                .buttonStyle(.borderless)
                .font(.title2)
                .foregroundStyle(.secondary)
                .help(String(localized: "Disconnect \(account.handle)"))
        }
    }
}

// MARK: - ConnectAccountSheet

/// Asks for the server or handle and starts the sign-in there. The sheet
/// stays open while the browser sheet is up and closes once the account
/// is connected; a failure is shown below the field.
private struct ConnectAccountSheet: View {
    let service: SocialService
    @Environment(\.dismiss) private var dismiss
    @State private var input = ""
    @State private var isWorking = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(service.sheetTitle)
                .font(.headline)
            Text(service.sheetExplanation)
                .foregroundStyle(.secondary)

            TextField(service.fieldLabel, text: $input, prompt: Text(verbatim: service.placeholder))
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
                    .disabled(isWorking || input.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .padding(20)
        .frame(width: 380)
    }

    private func connect() {
        guard !isWorking else { return }
        isWorking = true
        errorMessage = nil
        Task {
            defer { isWorking = false }
            do {
                try await service.connect(input)
                dismiss()
            } catch is CancellationError {
                // The user closed the browser sheet; the field stays as it was.
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}

#Preview {
    let store = SocialAccountStore(directory: nil, keychain: nil)
    store.add(MastodonAccount(instance: URL(string: "https://oldbytes.space")!, accountID: "1", username: "musiccloud",
                              displayName: "musiccloud", avatarURL: nil, characterLimit: 5000), token: "preview")
    return SocialMediaPane()
        .environment(store)
        .frame(width: 520, height: 440)
}

#endif
