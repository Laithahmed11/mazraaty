import SwiftUI

@main
@MainActor
struct MazraatyApp: App {
    @StateObject private var store = AppStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .environment(\.layoutDirection, .rightToLeft)
                .environment(\.locale, Locale(identifier: "ar_IQ"))
                .environment(\.timeZone, BaghdadDay.timeZone)
                .tint(Theme.forest)
                .preferredColorScheme(.light)
        }
    }
}
