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
    @Environment(AutoPostSettings.self) private var autoPostSettings
    @State private var serviceToConnect: SocialService?
    @State private var accountToDisconnect: SocialAccount?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                SettingsCard(tint: nil, footer: String(localized: "Each account below says whether it takes part and with which template. A link that is already in the history is not posted again.")) {
                    Toggle(String(localized: "Post new conversions automatically"), isOn: Bindable(autoPostSettings).isEnabled)
                }
                accountSection(.mastodon, accounts: store.mastodonAccounts.map(SocialAccount.mastodon))
                accountSection(.bluesky, accounts: store.blueskyAccounts.map(SocialAccount.bluesky))
            }
            .padding(20)
            // Outside a Form a toggle is a checkbox; the other panes show switches.
            .toggleStyle(.switch)
        }
        .background(Color(nsColor: .windowBackgroundColor))
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

    /// One service as a card tinted in its brand color: its name and an Add
    /// Account button in the header, then the connected accounts.
    private func accountSection(_ service: SocialService, accounts: [SocialAccount]) -> some View {
        SettingsCard(tint: service.brandColor, footer: service.footer) {
            if accounts.isEmpty {
                Text("No accounts connected.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(Array(accounts.enumerated()), id: \.element.id) { index, account in
                    if index > 0 {
                        Divider()
                    }
                    ConnectedAccountRow(account: account) {
                        accountToDisconnect = account
                    }
                }
            }
        } header: {
            Label {
                Text(verbatim: service.name)
                    .font(.headline)
            } icon: {
                PostTemplateIconImage(icon: service.icon)
            }
            Spacer()
            Button(String(localized: "Add Account…")) {
                serviceToConnect = service
            }
        }
    }
}

// MARK: - SettingsCard

/// A rounded card with an optional header row and a footer note below it.
///
/// With a `tint`, the header's background and the border take that color,
/// faintly, so a service's card reads as that service without shouting.
private struct SettingsCard<Content: View, Header: View>: View {
    let tint: Color?
    let footer: String
    @ViewBuilder let content: () -> Content
    @ViewBuilder let header: () -> Header

    private let shape = RoundedRectangle(cornerRadius: 10)

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            VStack(alignment: .leading, spacing: 0) {
                if Header.self != EmptyView.self {
                    HStack(content: header)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background((tint ?? .secondary).opacity(0.08))
                    Divider()
                        .overlay((tint ?? .secondary).opacity(0.25))
                }
                VStack(alignment: .leading, spacing: 10, content: content)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(Color(nsColor: .controlBackgroundColor))
            .clipShape(shape)
            .overlay(shape.strokeBorder(tint.map { $0.opacity(0.35) } ?? Color(nsColor: .separatorColor)))

            Text(footer)
                .font(.callout)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 4)
        }
    }
}

extension SettingsCard where Header == EmptyView {
    init(tint: Color?, footer: String, @ViewBuilder content: @escaping () -> Content) {
        self.init(tint: tint, footer: footer, content: content, header: { EmptyView() })
    }
}

private extension SocialService {
    /// The service's brand color: Mastodon's `#6364FF` from joinmastodon.org/branding,
    /// Bluesky's `#1185FE` from bsky.app.
    var brandColor: Color {
        switch self {
        case .mastodon: Color(red: 0x63 / 255, green: 0x64 / 255, blue: 0xFF / 255)
        case .bluesky:  Color(red: 0x11 / 255, green: 0x85 / 255, blue: 0xFE / 255)
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
        case .bluesky:  String(localized: "Enter your Bluesky name. A handle on a domain of your own, such as musiccloud.io, works as well.")
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
        case .bluesky:  "name"
        }
    }

    /// The end of the handle shown beside the field while the input has no
    /// domain of its own, which ``BlueskyAPI/handle(from:)`` then adds.
    func fixedSuffix(for input: String) -> String? {
        switch self {
        case .mastodon: nil
        case .bluesky:  input.contains(".") ? nil : "." + BlueskyAPI.defaultHandleDomain
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

// MARK: - ConnectedAccountRow

/// One connected account with a button at the trailing edge that asks to
/// disconnect it. While automatic posting is on, the row also says whether
/// this account takes part and with which template.
private struct ConnectedAccountRow: View {
    let account: SocialAccount
    /// Asks to disconnect the account; the pane confirms before it does.
    let onDisconnect: () -> Void

    @Environment(AutoPostSettings.self) private var autoPost
    @Environment(PostTemplateStore.self) private var templates

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                SocialAccountLabel(account: account)

                Spacer()

                Button(String(localized: "Disconnect"), systemImage: "trash", action: onDisconnect)
                    .labelStyle(.iconOnly)
                    .buttonStyle(.borderless)
                    .font(.title2)
                    .foregroundStyle(.secondary)
                    .help(String(localized: "Disconnect \(account.handle)"))
            }

            if autoPost.isEnabled {
                HStack {
                    Toggle(String(localized: "Post automatically"), isOn: rule(\.isEnabled))
                    Spacer()
                    Picker(String(localized: "Template"), selection: rule(\.templateID)) {
                        Text("None").tag(PostTemplate.ID?.none)
                        ForEach(templates.systemTemplates + templates.templates) { template in
                            Text(template.name).tag(Optional(template.id))
                        }
                    }
                    .labelsHidden()
                    .fixedSize()
                    .disabled(!autoPost.rule(for: account.id).isEnabled)
                }
                .controlSize(.small)
            }
        }
    }

    /// A binding to one field of this account's automatic posting rule.
    private func rule<Value>(_ field: WritableKeyPath<AutoPostSettings.AccountRule, Value>) -> Binding<Value> {
        Binding {
            autoPost.rule(for: account.id)[keyPath: field]
        } set: { value in
            var rule = autoPost.rule(for: account.id)
            rule[keyPath: field] = value
            autoPost.setRule(rule, for: account.id)
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

            HStack(spacing: 6) {
                TextField(service.fieldLabel, text: $input, prompt: Text(verbatim: service.placeholder))
                    .textFieldStyle(.roundedBorder)
                    .disabled(isWorking)
                    .onSubmit(connect)
                if let suffix = service.fixedSuffix(for: input) {
                    Text(verbatim: suffix)
                        .foregroundStyle(.secondary)
                }
            }

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
        .environment(AutoPostSettings(defaults: UserDefaults(suiteName: "SocialMediaPanePreview") ?? .standard))
        .environment(PostTemplateStore(fileURL: nil))
        .frame(width: 520, height: 440)
}

#endif
