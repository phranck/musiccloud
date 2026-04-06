//
//  AnimatedSegmentControl.swift
//  musiccloud
//
//  Created by Frank Gregor on 06.04.26.
//

import SwiftUI

// MARK: - Segment

struct Segment<Tag: Hashable>: Identifiable {
    let id = UUID()
    let title: String
    let systemImage: String?
    let tag: Tag

    static func text(_ title: String, tag: Tag) -> Segment {
        Segment(title: title, systemImage: nil, tag: tag)
    }

    static func label(_ title: String, systemImage: String, tag: Tag) -> Segment {
        Segment(title: title, systemImage: systemImage, tag: tag)
    }
}

// MARK: - AnimatedSegmentControl

struct AnimatedSegmentControl<Tag: Hashable>: View {
    @Binding var selection: Tag
    let segments: [Segment<Tag>]
    var tintColor: Color = .accentColor

    @Environment(\.controlSize) private var controlSize
    @Namespace private var namespace

    // MARK: Public API

    var body: some View {
        HStack(spacing: 0) {
            ForEach(segments) { segment in
                segmentButton(for: segment)
            }
        }
        .padding(metrics.backgroundPadding)
        .background(.quaternary, in: .capsule)
        .animation(.smooth(duration: 0.25), value: selection)
    }
}

// MARK: - Private API

private extension AnimatedSegmentControl {
    struct Metrics {
        let titleFont: Font
        let iconFont: Font
        let horizontalPadding: CGFloat
        let verticalPadding: CGFloat
        let backgroundPadding: CGFloat
        let iconSpacing: CGFloat
    }

    var metrics: Metrics {
        switch controlSize {
        case .small:
            Metrics(titleFont: .caption, iconFont: .caption2, horizontalPadding: 10, verticalPadding: 4, backgroundPadding: 2, iconSpacing: 3)
        case .large:
            Metrics(titleFont: .body, iconFont: .subheadline, horizontalPadding: 20, verticalPadding: 8, backgroundPadding: 3, iconSpacing: 5)
        default:
            Metrics(titleFont: .subheadline, iconFont: .caption, horizontalPadding: 16, verticalPadding: 6, backgroundPadding: 2, iconSpacing: 4)
        }
    }

    func segmentButton(for segment: Segment<Tag>) -> some View {
        let isSelected = selection == segment.tag

        return Button {
            selection = segment.tag
        } label: {
            segmentLabel(for: segment, isSelected: isSelected)
        }
        .buttonStyle(.plain)
        .background {
            if isSelected {
                Capsule()
                    .fill(tintColor)
                    .matchedGeometryEffect(id: "selection", in: namespace)
            }
        }
    }

    @ViewBuilder
    func segmentLabel(for segment: Segment<Tag>, isSelected: Bool) -> some View {
        HStack(spacing: metrics.iconSpacing) {
            if let systemImage = segment.systemImage {
                Image(systemName: systemImage)
                    .font(metrics.iconFont)
            }
            Text(segment.title)
                .font(metrics.titleFont)
        }
        .fontWeight(isSelected ? .regular : .regular)
        .foregroundStyle(isSelected ? .primary : .secondary)
        .fixedSize()
        .padding(.horizontal, metrics.horizontalPadding)
        .padding(.vertical, metrics.verticalPadding)
        .contentShape(.capsule)
    }
}

// MARK: - Preview

private enum PreviewTab: String, CaseIterable {
    case all = "All"
    case favorites = "Favorites"
    case recent = "Recent"
}

private enum PreviewNavTab: String, CaseIterable {
    case history = "History"
    case search = "Search"
    case settings = "Settings"
}

#Preview("Text Segments") {
    @Previewable @State var selection: PreviewTab = .all

    VStack(spacing: 20) {
        AnimatedSegmentControl(selection: $selection, segments: [
            .text("All", tag: PreviewTab.all),
            .text("Favorites", tag: .favorites),
            .text("Recent", tag: .recent),
        ])
        .controlSize(.small)

        AnimatedSegmentControl(selection: $selection, segments: [
            .text("All", tag: PreviewTab.all),
            .text("Favorites", tag: .favorites),
            .text("Recent", tag: .recent),
        ])

        AnimatedSegmentControl(selection: $selection, segments: [
            .text("All", tag: PreviewTab.all),
            .text("Favorites", tag: .favorites),
            .text("Recent", tag: .recent),
        ])
        .controlSize(.large)
    }
    .padding()
}

#Preview("Label Segments") {
    @Previewable @State var selection: PreviewNavTab = .history

    VStack(spacing: 20) {
        AnimatedSegmentControl(selection: $selection, segments: [
            .label("History", systemImage: "clock", tag: PreviewNavTab.history),
            .label("Search", systemImage: "magnifyingglass", tag: .search),
            .label("Settings", systemImage: "gearshape", tag: .settings),
        ], tintColor: .orange)
        .controlSize(.small)

        AnimatedSegmentControl(selection: $selection, segments: [
            .label("History", systemImage: "clock", tag: PreviewNavTab.history),
            .label("Search", systemImage: "magnifyingglass", tag: .search),
            .label("Settings", systemImage: "gearshape", tag: .settings),
        ], tintColor: .orange)

        AnimatedSegmentControl(selection: $selection, segments: [
            .label("History", systemImage: "clock", tag: PreviewNavTab.history),
            .label("Search", systemImage: "magnifyingglass", tag: .search),
            .label("Settings", systemImage: "gearshape", tag: .settings),
        ], tintColor: .orange)
        .controlSize(.large)
    }
    .padding()
}
