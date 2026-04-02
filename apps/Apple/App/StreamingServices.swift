import Foundation

// MARK: - StreamingServices

enum StreamingServices {
  private static let exactDomains: Set<String> = [
    "open.spotify.com", "play.spotify.com",
    "music.apple.com",
    "youtube.com", "www.youtube.com", "youtu.be", "music.youtube.com",
    "soundcloud.com", "www.soundcloud.com",
    "tidal.com", "www.tidal.com", "listen.tidal.com",
    "deezer.com", "www.deezer.com",
    "audius.co",
    "napster.com", "play.napster.com", "web.napster.com",
    "pandora.com", "www.pandora.com",
    "open.qobuz.com", "play.qobuz.com",
    "boomplay.com", "www.boomplay.com",
    "kkbox.com", "www.kkbox.com",
    "audiomack.com", "www.audiomack.com",
    "music.163.com",
    "y.qq.com",
    "melon.com", "www.melon.com",
    "music.bugs.co.kr",
    "jiosaavn.com", "www.jiosaavn.com",
    "beatport.com", "www.beatport.com"
  ]

  private static let suffixDomains: [String] = [
    ".bandcamp.com"
  ]
}

// MARK: - URL Matching

extension StreamingServices {
  static func isStreamingURL(_ urlString: String) -> Bool {
    guard
      urlString.count <= 500,
      let url = URL(string: urlString),
      let host = url.host?.lowercased()
    else { return false }

    if exactDomains.contains(host) { return true }
    return suffixDomains.contains { host.hasSuffix($0) || host == String($0.dropFirst()) }
  }
}
