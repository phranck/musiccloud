# DocC Documentation Guide for musiccloud

This guide shows how to add comprehensive DocC documentation to the musiccloud codebase.

## Documentation Template for Classes/Structs

```swift
/// Brief one-line description of what this does.
///
/// More detailed explanation of the type, its purpose, and when to use it.
/// Can include multiple paragraphs.
///
/// ## Features
///
/// - Feature one
/// - Feature two
/// - Feature three
///
/// ## Usage
///
/// ```swift
/// let example = MyType(param: value)
/// example.doSomething()
/// ```
///
/// ## Topics
///
/// ### Initialization
/// - ``init(param:)``
///
### Main Properties
/// - ``property1``
/// - ``property2``
///
/// ### Methods
/// - ``method1()``
/// - ``method2(param:)``
struct/class MyType {
    // Implementation
}
```

## Documentation Template for Properties

```swift
/// Brief description of what this property represents.
///
/// More details if needed. Explain when it changes, what values are valid, etc.
var myProperty: Type
```

## Documentation Template for Methods

```swift
/// Brief description of what this method does.
///
/// Extended description providing more context, explaining behavior,
/// side effects, or important implementation details.
///
/// - Parameters:
///   - param1: Description of first parameter
///   - param2: Description of second parameter
/// - Returns: Description of return value
/// - Throws: Description of errors that can be thrown
///
/// ## Example
///
/// ```swift
/// try myMethod(param1: "value", param2: 42)
/// ```
func myMethod(param1: String, param2: Int) throws -> Result {
    // Implementation
}
```

## Documentation Template for Enums

```swift
/// Brief description of what this enum represents.
///
/// Details about when to use each case.
///
/// ## Cases
///
/// - ``case1``: Description
/// - ``case2(value:)``: Description with associated value
enum MyEnum {
    /// Description of case1
    case case1
    
    /// Description of case2
    /// - Parameter value: What the associated value represents
    case case2(value: String)
}
```

## Quick Reference: Common Documentation Patterns

### For Observable Classes
```swift
/// Manages [what it manages].
///
/// `ClassName` provides [main functionality]. It uses the `@Observable`
/// macro to automatically publish changes to SwiftUI views.
@Observable
final class ClassName { }
```

### For Views
```swift
/// A view that displays [what it displays].
///
/// Use `ViewName` to [when to use it].
struct ViewName: View { }
```

### For API/Network Types
```swift
/// Provides API access to [service name].
///
/// All methods are asynchronous and throw errors on failure.
enum APIName { }
```

### For Models
```swift
/// Represents [what it represents] in the application.
///
/// Conforms to `Codable` for JSON serialization and `Identifiable` for SwiftUI lists.
struct ModelName: Codable, Identifiable { }
```

## Applying to musiccloud Files

### Priority Order
1. **ClipboardMonitor** - Core functionality
2. **Models** (ConversionEntry, TrackInfo, etc.) - Data structures
3. **MusicCloudAPI** - Network layer
4. **HistoryManager** - State management
5. **Views** (MenuBarView, StatusCard, etc.) - UI components
6. **Utilities** (StreamingServices, AppLogger) - Helpers

### Example: Fully Documented Model

```swift
/// Represents a successful URL conversion from a streaming service to musiccloud.
///
/// `ConversionEntry` stores all information about a converted URL including
/// the original URL, short URL, metadata (track/album/artist info), and artwork.
///
/// ## Storage
///
/// Entries are automatically persisted by ``HistoryManager`` and displayed
/// in the conversion history UI.
///
/// ## Topics
///
/// ### Creating an Entry
/// - ``init(id:originalUrl:shortUrl:contentType:track:album:artist:artworkImageData:date:)``
///
/// ### Properties
/// - ``id``
/// - ``originalUrl``
/// - ``shortUrl``
/// - ``contentType``
/// - ``track``
/// - ``album``
/// - ``artist``
/// - ``artworkImageData``
/// - ``date``
struct ConversionEntry: Codable, Identifiable, Equatable {
    /// Unique identifier for this conversion
    let id: UUID
    
    /// The original streaming service URL that was converted
    var originalUrl: String
    
    /// The shortened musiccloud.io URL
    var shortUrl: String
    
    /// The type of content (track, album, or artist)
    var contentType: ContentType
    
    /// Track metadata if this is a track URL
    var track: TrackInfo?
    
    /// Album metadata if this is an album URL
    var album: AlbumInfo?
    
    /// Artist metadata if this is an artist URL
    var artist: ArtistInfo?
    
    /// Downloaded artwork image data
    var artworkImageData: Data?
    
    /// When this conversion was created
    var date: Date
    
    /// Creates a new conversion entry.
    ///
    /// - Parameters:
    ///   - id: Unique identifier (default: auto-generated UUID)
    ///   - originalUrl: The source streaming URL
    ///   - shortUrl: The generated musiccloud.io URL
    ///   - contentType: Type of content (default: `.track`)
    ///   - track: Track metadata if available
    ///   - album: Album metadata if available
    ///   - artist: Artist metadata if available
    ///   - artworkImageData: Downloaded artwork data
    ///   - date: Creation timestamp (default: current time)
    init(
        id: UUID = UUID(),
        originalUrl: String,
        shortUrl: String,
        contentType: ContentType = .track,
        track: TrackInfo? = nil,
        album: AlbumInfo? = nil,
        artist: ArtistInfo? = nil,
        artworkImageData: Data? = nil,
        date: Date = .now
    ) {
        self.id = id
        self.originalUrl = originalUrl
        self.shortUrl = shortUrl
        self.contentType = contentType
        self.track = track
        self.album = album
        self.artist = artist
        self.artworkImageData = artworkImageData
        self.date = date
    }
}
```

## Tips

1. **Be Concise but Complete**: First line should be < 120 characters
2. **Use Markdown**: Bold, italic, lists, code blocks, links
3. **Add Examples**: Show real usage when helpful
4. **Link Related Types**: Use double backticks for ``OtherType`` links
5. **Document Throws**: Always document what errors can be thrown
6. **Explain "Why"**: Not just "what" it does, but when to use it
7. **Keep It Updated**: Update docs when changing functionality

## Building Documentation

In Xcode:
1. Product → Build Documentation (⌃⌘D)
2. View documentation in Developer Documentation window
3. Export for web hosting if needed

## References

- [Apple DocC Documentation](https://developer.apple.com/documentation/docc)
- [DocC Tutorial](https://developer.apple.com/documentation/docc/documenting-a-swift-framework-or-package)
