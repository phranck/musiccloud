#if os(macOS)
//
//  VariableLegend.swift
//  musiccloud
//

import SwiftData
import SwiftUI

// MARK: - VariableLegend

/// The legend beside the template editor: every variable with what it
/// stands for and its value in the newest history entry, then the entry's
/// service links.
///
/// The values show what a placeholder turns into before anything is
/// posted. A variable the newest entry has no value for says so, which is
/// also what tells the user its line would be left out.
struct VariableLegend: View {
    @Query private var newestEntries: [MediaEntry]

    init() {
        var newest = FetchDescriptor<MediaEntry>(sortBy: [SortDescriptor(\.date, order: .reverse)])
        newest.fetchLimit = 1
        _newestEntries = Query(newest)
    }

    var body: some View {
        let context = newestEntries.first.map(PostContext.init(entry:))
        List {
            Section(String(localized: "Variables")) {
                ForEach(PostVariable.allCases) { variable in
                    LegendRow(
                        token: variable.token,
                        title: variable.title,
                        value: context.flatMap(variable.value(in:))
                    )
                }
            }
            if let links = context?.serviceLinks, !links.isEmpty {
                Section(String(localized: "Service Links")) {
                    ForEach(links, id: \.service) { link in
                        LegendRow(
                            token: "{\(link.service)\(PostTemplateRenderer.serviceLinkSuffix)}",
                            title: link.displayName,
                            value: link.url
                        )
                    }
                }
            }
        }
        .listStyle(.sidebar)
    }
}

// MARK: - LegendRow

/// One placeholder: the token as typed, its meaning, and its current value.
private struct LegendRow: View {
    let token: String
    let title: String
    let value: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(verbatim: token)
                .font(.body.monospaced())
                .foregroundStyle(Color(nsColor: TemplateSyntaxColors.variable))
                .textSelection(.enabled)
            Text(title)
            Text(value ?? String(localized: "No value"))
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .truncationMode(.middle)
        }
        .padding(.vertical, 2)
    }
}

#endif
