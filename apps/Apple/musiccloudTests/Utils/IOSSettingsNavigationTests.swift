#if os(iOS)
import Testing
@testable import musiccloud

/// Exercises the same destination model that builds the live Settings overview.
struct IOSSettingsNavigationTests {
    /// Production builds cannot expose diagnostics by traversing the root Settings list.
    @Test func diagnosticsAreHiddenWhenTheChannelDisablesThem() {
        let destinations = IOSSettingsGroup.allCases.flatMap { $0.destinations(diagnosticsEnabled: false) }
        #expect(!destinations.contains(.diagnostics))
    }

    /// TestFlight builds expose exactly one diagnostics route without duplicating other destinations.
    @Test func permittedDestinationsAreReachableExactlyOnce() {
        let destinations = IOSSettingsGroup.allCases.flatMap { $0.destinations(diagnosticsEnabled: true) }
        #expect(destinations.filter { $0 == .diagnostics }.count == 1)
        #expect(Set(destinations).count == destinations.count)
        #expect(Set(destinations) == Set(IOSSettingsDestination.allCases))
    }

    /// Destructive operations live behind the data destination rather than in support or general preferences.
    @Test func dataManagementIsConfinedToItsOwnGroup() {
        #expect(IOSSettingsGroup.data.destinations(diagnosticsEnabled: true) == [.dataManagement])
        for group in IOSSettingsGroup.allCases where group != .data {
            #expect(!group.destinations(diagnosticsEnabled: true).contains(.dataManagement))
        }
    }
}
#endif
