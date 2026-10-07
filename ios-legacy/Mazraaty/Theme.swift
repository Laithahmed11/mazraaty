import SwiftUI

enum Theme {
    static let forest = Color(red: 0.08, green: 0.30, blue: 0.23)
    static let deep = Color(red: 0.05, green: 0.20, blue: 0.16)
    static let mint = Color(red: 0.86, green: 0.95, blue: 0.86)
    static let canvas = Color(red: 0.97, green: 0.98, blue: 0.95)
    static let gold = Color(red: 0.93, green: 0.74, blue: 0.37)
    static let muted = Color(red: 0.36, green: 0.44, blue: 0.39)
}

extension Int {
    var iqd: String {
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "ar_IQ")
        formatter.numberStyle = .decimal
        return "\(formatter.string(from: NSNumber(value: self)) ?? String(self)) د.ع"
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    var destructive = false
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .frame(maxWidth: .infinity, minHeight: 50)
            .padding(.horizontal, 16)
            .background(destructive ? Color.red : Theme.forest, in: RoundedRectangle(cornerRadius: 16))
            .foregroundStyle(.white)
            .opacity(configuration.isPressed ? 0.8 : 1)
    }
}

struct FarmImage: View {
    let urlString: String?
    var placeholderTitle = "صورة المزرعة"
    var body: some View {
        AsyncImage(url: validURL) { phase in
            switch phase {
            case .success(let image): image.resizable().scaledToFill()
            case .empty:
                placeholder.overlay { if validURL != nil { ProgressView().tint(Theme.forest) } }
            case .failure: placeholder
            @unknown default: placeholder
            }
        }
        .accessibilityHidden(true)
    }

    private var validURL: URL? {
        guard let urlString, let url = URL(string: urlString), url.scheme == "https" else { return nil }
        return url
    }

    private var placeholder: some View {
        Rectangle().fill(Theme.mint.gradient)
            .overlay {
                VStack(spacing: 8) {
                    Image(systemName: "photo.on.rectangle.angled").font(.largeTitle)
                    Text(placeholderTitle).font(.caption)
                }
                .foregroundStyle(Theme.muted)
            }
    }
}

struct NoticeView: View {
    let message: String
    var isError = false
    var body: some View {
        Label(message, systemImage: isError ? "exclamationmark.circle" : "info.circle")
            .font(.subheadline)
            .foregroundStyle(isError ? Color.red : Theme.forest)
            .fixedSize(horizontal: false, vertical: true)
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(isError ? Color.red.opacity(0.06) : Theme.mint.opacity(0.7), in: RoundedRectangle(cornerRadius: 14))
            .accessibilityElement(children: .combine)
    }
}

struct EmptyState: View {
    let symbol: String
    let title: String
    let message: String
    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: symbol).font(.system(size: 40)).foregroundStyle(Theme.forest)
            Text(title).font(.title3.bold())
            Text(message).font(.subheadline).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
        }
        .padding(32)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }
}
