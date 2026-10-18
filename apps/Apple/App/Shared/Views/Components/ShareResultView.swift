#if os(iOS)
//
//  ShareResultView.swift
//  musiccloud
//

import SwiftUI

// MARK: - ShareResultView

/// The screen after a link is converted: the cover, title and artist, the
/// link with its copy button, and the connected accounts to post it to.
///
/// The Share Extension shows it after its own conversion, and the iOS app
/// shows it in the conversion sheet for a link it found on the clipboard.
///
/// With several accounts none is checked at first, so nothing is posted
/// without a tap. A single account needs no choice and is checked from the
/// start, unless its text does not fit. Each account posts with its default
/// template, which on iOS is the system template of its service, written and
/// sent through ``PostComposerModel`` as the Mac's composer does, and reports
/// its result in its own row. Without connected accounts the screen offers no
/// posting at all.
struct ShareResultView: View {
    let entry: MediaEntry
    /// Closes the screen: the Share Extension ends, the app's sheet goes away.
    let onDone: () -> Void

    @State private var model: PostComposerModel
    /// Whether the copy button has just copied the link, so it shows its confirmation.
    @State private var didCopyLink = false

    /// How long the copy button shows its confirmation before it reads as a button again.
    private static let copyConfirmation: Duration = .seconds(2)

    /// - Parameters:
    ///   - entry: The converted entry, already in the history.
    ///   - accounts: The connected accounts.
    ///   - onDone: Closes the screen.
    init(entry: MediaEntry, accounts: [SocialAccount], onDone: @escaping () -> Void) {
        self.entry = entry
        self.onDone = onDone
        let model = PostComposerModel(context: PostContext(entry: entry), accounts: accounts)
        if let only = accounts.first, accounts.count == 1, !model.isOutOfBounds(only) { model.selectedAccountIDs = [only.id] }
        _model = State(initialValue: model)
    }

    /// Whether the accounts are offered for choosing, which takes more than one.
    private var offersChoice: Bool { model.accounts.count > 1 }

    var body: some View {
        Form {
            Section { cover.listRowInsets(EdgeInsets()).listRowBackground(Color.clear).listRowSeparator(.hidden) }
                // The cover reaches from edge to edge of the sheet, past the form's margins.
                .edgeToEdgeSection()

            // The link itself, right below the cover, with or without accounts.
            Section {
                Text(entry.shortUrl).font(.subheadline).textSelection(.enabled).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                copyLinkButton
            }.listRowBackground(Color.clear).listRowSeparator(.hidden)

            if !model.accounts.isEmpty {
                Section(String(localized: "Accounts")) {
                    ForEach(model.accounts) { account in AccountRow(model: model, account: account, isChoosable: offersChoice) }
                }
            }
        }  // The cover starts right below the header, without the form's top gap.
        .contentMargins(.top, 0, for: .scrollContent)  // Closing ends the Share Extension, and a post on its way would end with it.
        .sheetHeader(isCloseDisabled: model.isPosting, onClose: onDone).safeAreaInset(edge: .bottom) {
            if !model.accounts.isEmpty { postButton }
        }
    }

    /// The square cover over the sheet's full width, with the title and the
    /// artist on a band at its foot that darkens downward, so white text
    /// stays readable on light artwork too.
    private var cover: some View {
        Color.clear.aspectRatio(1, contentMode: .fit).overlay {
            CachedAsyncImage(entry: entry) { ArtworkPlaceholder(icon: entry.contentType.placeholderIcon, symbolFont: .system(size: 64)) }
        }.clipped().overlay(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 4) {
                Text(entry.contentType.title).font(.title2.bold())
                Text(entry.contentType.subtitle).font(.headline).foregroundStyle(.white.opacity(0.8))
            }.foregroundStyle(.white).lineLimit(2).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 20).padding(
                .top,
                56
            ).padding(.bottom, 20).background {
                LinearGradient(colors: [.black.opacity(0), .black.opacity(0.75)], startPoint: .top, endPoint: .bottom)
            }
        }.accessibilityElement(children: .combine)
    }

    /// How long the sheet stays open after every post went out, so the green
    /// checks can be seen before it closes.
    private static let closeDelay: Duration = .seconds(2)

    /// Copies the musiccloud link and confirms it for a moment.
    ///
    /// The label is text only, so it sits centered in the button.
    private var copyLinkButton: some View {
        Button {
            Pasteboard.copy(entry.shortUrl)
            didCopyLink = true
        } label: {
            Text(didCopyLink ? String(localized: "Copied to clipboard!") : String(localized: "Copy URL to Clipboard")).frame(
                maxWidth: .infinity
            )
        }.buttonStyle(.borderedProminent).controlSize(.large).sensoryFeedback(.success, trigger: didCopyLink) { _, copied in copied }.task(
            id: didCopyLink
        ) {
            guard didCopyLink
            else {
                return
            }
            try? await Task.sleep(for: Self.copyConfirmation)
            didCopyLink = false
        }
    }

    private var postButton: some View {
        Button {
            Task { await post() }
        } label: {
            // The title stays in the layout while the spinner shows, so the
            // button keeps its size.
            Text("Post").opacity(model.isPosting ? 0 : 1).overlay { if model.isPosting { ProgressView() } }.frame(maxWidth: .infinity)
        }.buttonStyle(.borderedProminent).controlSize(.large).disabled(!model.canPost).padding()
    }

    /// Posts to the checked accounts and closes the sheet once every one of
    /// them went out. After a failure it stays open, so the error can be read
    /// and the post tried again.
    private func post() async {
        await model.post { account, text in try await account.post(text) }
        guard model.selectedAccounts.allSatisfy({ model.states[$0.id] == .posted })
        else {
            return
        }
        try? await Task.sleep(for: Self.closeDelay)
        onDone()
    }
}

// MARK: - SheetHeader

/// The bar at the top of the result screen and of every state of the iOS
/// app's conversion sheet: the wordmark centered across the full width and
/// the close button at the trailing edge.
///
/// It is a view of its own rather than navigation bar content, because the
/// alignment of the bar's principal placement is not documented. So the
/// wordmark and the close button sit in the same place in every state and
/// in the Share Extension.
struct SheetHeader: View {
    private static let horizontalPadding: CGFloat = 16
    private static let verticalPadding: CGFloat = 12

    /// Whether the close button is disabled, such as while a post is on its way.
    var isCloseDisabled = false
    /// Closes the screen.
    let onClose: () -> Void

    var body: some View {
        OutlinedLogoText(size: 25).frame(maxWidth: .infinity).overlay(alignment: .trailing) {
            Button(action: onClose) {
                Image(systemName: "xmark.circle.fill").symbolRenderingMode(.hierarchical).font(.title2).foregroundStyle(.secondary)
            }.accessibilityLabel(String(localized: "Close")).disabled(isCloseDisabled)
        }.padding(.horizontal, Self.horizontalPadding).padding(.vertical, Self.verticalPadding)
    }
}

extension View {
    /// Pins a ``SheetHeader`` above this view.
    ///
    /// On iOS 26 it is a safe area bar, which gives it the system's scroll
    /// edge effect. Before, `safeAreaBar` does not exist, so it is a safe area
    /// inset on the bar material, which keeps scrolled content legible below it.
    ///
    /// - Parameters:
    ///   - isCloseDisabled: Whether the close button is disabled.
    ///   - onClose: Closes the screen.
    @ViewBuilder func sheetHeader(isCloseDisabled: Bool = false, onClose: @escaping () -> Void) -> some View {
        let header = SheetHeader(isCloseDisabled: isCloseDisabled, onClose: onClose)
        if #available(iOS 26, *) {
            safeAreaBar(edge: .top, spacing: 0) { header }
        } else {
            safeAreaInset(edge: .top, spacing: 0) { header.background(.bar) }
        }
    }

    /// Lets the rows of a form section reach the edges of the screen.
    ///
    /// `listSectionMargins` exists from iOS 26 on. Before, the section keeps
    /// the form's margins.
    @ViewBuilder func edgeToEdgeSection() -> some View { if #available(iOS 26, *) { listSectionMargins(.horizontal, 0) } else { self } }
}

// MARK: - AccountRow

/// One connected account, and how posting went at the trailing edge.
///
/// Where there is a choice, the row carries a selection mark at the leading
/// edge, as iOS marks the chosen rows of a list, and a tap toggles it. A text
/// that does not fit the account is shown with its count in red, and the
/// account cannot be chosen.
private struct AccountRow: View {
    @Bindable var model: PostComposerModel
    let account: SocialAccount
    /// Whether the row can be checked and unchecked; a lone account cannot.
    let isChoosable: Bool

    private var isSelected: Bool { model.selectedAccountIDs.contains(account.id) }
    private var state: PostComposerModel.PostState { model.states[account.id] ?? .idle }
    private var isLocked: Bool { model.isPosting || state == .posted || model.isOutOfBounds(account) }

    var body: some View {
        if isChoosable {
            Button {
                model.selectedAccountIDs.formSymmetricDifference([account.id])
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: isSelected ? "checkmark.circle.fill" : "circle").font(.title2).foregroundStyle(
                        isSelected ? AnyShapeStyle(.tint) : AnyShapeStyle(.secondary)
                    )
                    content
                }
            }.buttonStyle(.plain).disabled(isLocked).accessibilityAddTraits(isSelected ? .isSelected : [])
        } else {
            content
        }
    }

    /// The account, a posting error below it, and the status at the end.
    private var content: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                SocialAccountLabel(account: account)
                if case .failed(let message) = state {
                    Label(message, systemImage: "exclamationmark.triangle.fill").font(.footnote).foregroundStyle(.red)
                }
            }
            Spacer()
            status
        }
    }

    @ViewBuilder private var status: some View {
        switch state {
        case .posting: ProgressView()
        case .posted: Label(String(localized: "Posted"), systemImage: "checkmark.circle.fill").labelStyle(.iconOnly).foregroundStyle(.green)
        case .idle, .failed:
            if model.isOutOfBounds(account) {
                Text(verbatim: "\(model.length(for: account)) / \(account.limit)").monospacedDigit().foregroundStyle(.red)
            }
        }
    }
}

#endif
