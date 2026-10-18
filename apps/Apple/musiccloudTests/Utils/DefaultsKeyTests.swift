import Foundation
import Testing
@testable import musiccloud

/// The sound settings move from the app's own defaults into the app group's,
/// so the share extension can follow them and an earlier choice survives.
struct DefaultsKeyTests {
    /// Two throwaway suites, removed again after each test.
    private func makeSuites() throws -> (source: UserDefaults, target: UserDefaults, names: [String]) {
        let names = ["DefaultsKeyTests.source.\(UUID().uuidString)", "DefaultsKeyTests.target.\(UUID().uuidString)"]
        let source = try #require(UserDefaults(suiteName: names[0]))
        let target = try #require(UserDefaults(suiteName: names[1]))
        return (source, target, names)
    }

    private func remove(_ names: [String]) { names.forEach { UserDefaults.standard.removePersistentDomain(forName: $0) } }

    @Test func movesAnEarlierChoice() throws {
        let (source, target, names) = try makeSuites()
        defer { remove(names) }
        source.set(false, forKey: DefaultsKey.playNotificationSound)
        source.set("sound3", forKey: DefaultsKey.notificationSound)

        DefaultsKey.moveSharedSettings(from: source, to: target)

        #expect(target.object(forKey: DefaultsKey.playNotificationSound) as? Bool == false)
        #expect(target.string(forKey: DefaultsKey.notificationSound) == "sound3")
        #expect(source.object(forKey: DefaultsKey.playNotificationSound) == nil)
        #expect(source.object(forKey: DefaultsKey.notificationSound) == nil)
    }

    @Test func keepsAValueAlreadyShared() throws {
        let (source, target, names) = try makeSuites()
        defer { remove(names) }
        source.set("sound3", forKey: DefaultsKey.notificationSound)
        target.set("sound9", forKey: DefaultsKey.notificationSound)

        DefaultsKey.moveSharedSettings(from: source, to: target)

        #expect(target.string(forKey: DefaultsKey.notificationSound) == "sound9")
        #expect(source.object(forKey: DefaultsKey.notificationSound) == nil)
    }
}
