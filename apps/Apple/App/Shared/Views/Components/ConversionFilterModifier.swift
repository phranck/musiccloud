import SwiftUI

// MARK: - Following Conversions

extension View {
    /// Switches a filter to the type of each successful conversion.
    ///
    /// The menu bar panel, the Dashboard and the iOS tabs all jump to the
    /// tab of what was just converted, so a new album shows up under Albums.
    ///
    /// - Parameters:
    ///   - monitor: The monitor whose conversions are followed.
    ///   - filter: The filter that switches to the converted type.
    func followsConversions(of monitor: ClipboardMonitor, filter: Binding<MediaFilter>) -> some View {
        onChange(of: monitor.status) {
            if case .success(_, let mediaType) = monitor.status { filter.wrappedValue = MediaFilter(for: mediaType) }
        }
    }
}
