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
                SettingsCard(
                    tint: nil,
                    footer: String(
                        localized:
                            "Each account below says whether it takes part. It posts with its default template. A link that is already in the history is not posted again."
                    )
                ) {
                    // Label left and switch at the trailing edge, as in a Form row.
                    HStack {
                        Text("Post new conversions automatically")
                        Spacer()
                        Toggle(String(localized: "Post new conversions automatically"), isOn: Bindable(autoPostSettings).isEnabled)
                            .labelsHidden()
                    }
                }
                accountSection(.mastodon)
                accountSection(.bluesky)
            }.padding(20)  // Outside a Form a toggle is a checkbox; the other panes show switches.
                .toggleStyle(.switch)
        }.background(Color(nsColor: .windowBackgroundColor)).sheet(item: $serviceToConnect) { service in
            ConnectAccountSheet(service: service)
        }.confirmationDialog(
            String(localized: "Disconnect \(accountToDisconnect?.handle ?? "")?"),
            isPresented: Binding(get: { accountToDisconnect != nil }, set: { if !$0 { accountToDisconnect = nil } }),
            presenting: accountToDisconnect
        ) { account in
            Button(String(localized: "Disconnect"), role: .destructive) { Task { await account.disconnect() } }
        } message: { _ in
            Text("musiccloud signs out of the account and can no longer post to it.")
        }
    }

    /// One service as a card tinted in its brand color: its name and an Add
    /// Account button in the header, then the connected accounts.
    private func accountSection(_ service: SocialService) -> some View {
        let accounts = service.accounts(in: store)
        return SettingsCard(tint: service.brandColor, footer: service.footer) {
            if accounts.isEmpty {
                Text("No accounts connected.").foregroundStyle(.secondary)
            } else {
                ForEach(Array(accounts.enumerated()), id: \.element.id) { index, account in
                    if index > 0 { Divider() }
                    ConnectedAccountRow(account: account) { accountToDisconnect = account }
                }
            }
        } header: {
            Label {
                Text(verbatim: service.name).font(.headline)
            } icon: {
                PostTemplateIconImage(icon: service.icon)
            }
            Spacer()
            Button(String(localized: "Add Account…")) { serviceToConnect = service }
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

    @Environment(\.colorScheme) private var colorScheme

    private let shape = RoundedRectangle(cornerRadius: 10)

    /// How strongly the tint shows. A brand color on a dark card has less
    /// contrast than on a light one, so dark mode takes more of it.
    private var strength: (header: Double, divider: Double, border: Double) { colorScheme == .dark ? (0.22, 0.55, 0.7) : (0.14, 0.4, 0.55) }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            VStack(alignment: .leading, spacing: 0) {
                if Header.self != EmptyView.self {
                    HStack(content: header).padding(.horizontal, 12).padding(.vertical, 8).background(
                        (tint ?? .secondary).opacity(strength.header)
                    )
                    Divider().overlay((tint ?? .secondary).opacity(strength.divider))
                }
                VStack(alignment: .leading, spacing: 10, content: content).padding(12).frame(maxWidth: .infinity, alignment: .leading)
            }.background(Color(nsColor: .controlBackgroundColor)).clipShape(shape).overlay(
                shape.strokeBorder(tint.map { $0.opacity(strength.border) } ?? Color(nsColor: .separatorColor))
            )

            Text(footer).font(.callout).foregroundStyle(.secondary).padding(.horizontal, 4)
        }
    }
}

extension SettingsCard where Header == EmptyView {
    init(tint: Color?, footer: String, @ViewBuilder content: @escaping () -> Content) {
        self.init(tint: tint, footer: footer, content: content, header: { EmptyView() })
    }
}

// MARK: - ConnectedAccountRow

/// One connected account with a button at the trailing edge that asks to
/// disconnect it. While automatic posting is on, the row also says whether
/// this account takes part; it posts with its default template, which the
/// Templates pane sets.
private struct ConnectedAccountRow: View {
    let account: SocialAccount
    /// Asks to disconnect the account; the pane confirms before it does.
    let onDisconnect: () -> Void

    @Environment(AutoPostSettings.self) private var autoPost

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                SocialAccountLabel(account: account)

                Spacer()

                Button(String(localized: "Disconnect"), systemImage: "trash", action: onDisconnect).labelStyle(.iconOnly).buttonStyle(
                    .borderless
                ).font(.title2).foregroundStyle(.secondary).help(String(localized: "Disconnect \(account.handle)"))
            }

            if autoPost.isEnabled {
                HStack {
                    Toggle(String(localized: "Post automatically"), isOn: autoPost.binding(\.isEnabled, for: account.id))
                    Spacer()
                }.controlSize(.small)
            }
        }
    }
}

// MARK: - ConnectAccountSheet

/// Asks for the server or handle and starts the sign-in there. The sheet
/// stays open while the browser sheet is up and closes once the account
/// is connected; a failure is shown below the field.
private struct ConnectAccountSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var model: ConnectAccountModel

    init(service: SocialService) { _model = State(initialValue: ConnectAccountModel(service: service)) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(model.service.sheetTitle).font(.headline)
            Text(model.service.sheetExplanation).foregroundStyle(.secondary)

            HStack(spacing: 6) {
                // A Bluesky handle is written with an `@`, so the field shows it rather than asking for it.
                if model.service == .bluesky { Text(verbatim: "@").foregroundStyle(.secondary) }
                TextField(model.service.fieldLabel, text: $model.input, prompt: Text(verbatim: model.service.placeholder)).textFieldStyle(
                    .roundedBorder
                ).disabled(model.isWorking).onSubmit(connect)
                if let suffix = model.fixedSuffix { Text(verbatim: suffix).foregroundStyle(.secondary) }
            }

            if let errorMessage = model.errorMessage { Text(errorMessage).font(.callout).foregroundStyle(.red) }

            HStack {
                if model.isWorking { ProgressView().controlSize(.small) }
                Spacer()
                Button(String(localized: "Cancel"), role: .cancel) { dismiss() }.keyboardShortcut(.cancelAction)
                Button(String(localized: "Connect"), action: connect).keyboardShortcut(.defaultAction).disabled(!model.canConnect)
            }
        }.padding(20).frame(width: 380)
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
    return SocialMediaPane().environment(store).environment(
        AutoPostSettings(defaults: UserDefaults(suiteName: "SocialMediaPanePreview") ?? .standard)
    ).frame(width: 520, height: 440)
}

#endif
