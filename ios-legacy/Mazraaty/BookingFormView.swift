import SwiftUI

@MainActor
struct BookingFormView: View {
    let farm: Farm
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var date = BaghdadDay.today
    @State private var guests = 1
    @State private var customerName = ""
    @State private var phone = ""
    @State private var notes = ""
    @State private var requestID = UUID().uuidString
    @State private var unavailable: Set<String> = []
    @State private var availabilityConfigured = false
    @State private var loadingAvailability = true
    @State private var sending = false
    @State private var error: String?
    @State private var availabilityError: String?
    @State private var completedBooking: Booking?
    @State private var submittedRequest: BookingRequest?
    @State private var acceptedPrivacy = false
    @State private var availabilityMessage: String?
    @State private var firstAvailableDate = BaghdadDay.today
    @State private var lastAvailableDate = BaghdadDay.calendar.date(byAdding: .day, value: 90, to: BaghdadDay.today)!

    private var dateString: String { BaghdadDay.string(from: date) }
    private var isBlocked: Bool { unavailable.contains(dateString) }
    private var trimmedName: String { customerName.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var valid: Bool {
        trimmedName.count >= 2 && trimmedName.count <= 100 && IraqiPhone.isValid(phone) &&
        notes.count <= 1000 && guests >= 1 && guests <= farm.capacity && acceptedPrivacy &&
        availabilityConfigured && availabilityError == nil && !loadingAvailability && !isBlocked &&
        dateString >= BaghdadDay.string(from: Date()) && farm.canRequestBooking
    }
    private var canSubmit: Bool { submittedRequest != nil || valid }
    private var locksInput: Bool { sending || submittedRequest != nil }

    var body: some View {
        NavigationStack {
            Group {
                if let booking = completedBooking { completion(booking) }
                else { form }
            }
            .navigationTitle(completedBooking == nil ? "طلب حجز" : "حالة الطلب")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("إغلاق") { dismiss() }.disabled(sending)
                }
            }
        }
        .interactiveDismissDisabled(sending)
        .task { await loadAvailability() }
    }

    private var form: some View {
        Form {
            Section {
                Text(farm.name).font(.title3.bold())
                Label(farm.priceIQD.iqd + " السعر المنشور", systemImage: "banknote")
                NoticeView(message: "هذا طلب مراجعة للتاريخ المطلوب، ولا يحجز موعد Wix وحده. مدة الخدمة والوقت والحجز الرسمي والدفع تُحدد في موقع Wix الأصلي.")
                if let url = farm.officialBookingURL {
                    Button { openURL(url) } label: { Label("إكمال الحجز في Wix", systemImage: "arrow.up.right.square") }
                }
            }
            Section("اختار اليوم") {
                DatePicker("تاريخ الحجز", selection: $date, in: firstAvailableDate...max(firstAvailableDate, lastAvailableDate), displayedComponents: .date)
                    .datePickerStyle(.graphical)
                    .environment(\.calendar, BaghdadDay.calendar)
                if loadingAvailability { ProgressView("نتحقق من الأيام المتاحة…") }
                if let availabilityMessage { NoticeView(message: availabilityMessage) }
                if let availabilityError {
                    NoticeView(message: availabilityError, isError: true)
                    Button("أعد التحقق من التوفر") { Task { await loadAvailability() } }
                } else if !availabilityConfigured && !loadingAvailability {
                    NoticeView(message: "خدمة التوفر تحتاج ربط Wix قبل استقبال الطلبات.")
                } else if isBlocked {
                    NoticeView(message: "هذا اليوم غير متاح. اختار يوماً آخر.", isError: true)
                } else if !loadingAvailability {
                    Label("يمكن إرسال طلب مراجعة لهذا اليوم", systemImage: "checkmark.circle").foregroundStyle(Theme.forest)
                }
                Text("التواريخ محسوبة حسب توقيت بغداد. التوفر النهائي يتحقق عند إرسال الطلب.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            .disabled(locksInput)
            Section("عدد الضيوف") {
                Stepper("\(guests) شخص", value: $guests, in: 1...max(1, farm.capacity))
                Text("السعة القصوى \(farm.capacity) شخص").font(.caption).foregroundStyle(.secondary)
            }
            .disabled(locksInput)
            Section("بيانات التواصل") {
                TextField("الاسم الكامل", text: $customerName)
                    .textContentType(.name).submitLabel(.next)
                TextField("رقم الهاتف العراقي", text: $phone)
                    .keyboardType(.phonePad).textContentType(.telephoneNumber)
                    .environment(\.layoutDirection, .leftToRight)
                if !phone.isEmpty && !IraqiPhone.isValid(phone) {
                    Text("اكتب رقم عراقي مثل 07XXXXXXXXX أو +9647XXXXXXXXX.")
                        .font(.caption).foregroundStyle(.red)
                }
                TextField("ملاحظات للإدارة (اختياري)", text: $notes, axis: .vertical)
                    .lineLimit(3...6)
                if notes.count > 1000 { Text("الملاحظات بحد أقصى ١٠٠٠ حرف.").font(.caption).foregroundStyle(.red) }
            }
            .disabled(locksInput)
            Section {
                Toggle("أوافق على إرسال اسمي وهاتفي وبيانات الطلب لإدارة مزرعتي لغرض متابعة الحجز.", isOn: $acceptedPrivacy)
                    .font(.subheadline)
                NavigationLink("سياسة الخصوصية") { PrivacyView() }
            }
            .disabled(locksInput)
            Section {
                if let error { NoticeView(message: error, isError: true) }
                if submittedRequest != nil && !sending {
                    NoticeView(message: "النتيجة غير محسومة. إعادة المحاولة ترسل نفس الطلب دون تغيير بياناته. لتعديل طلبك أغلق النموذج وراجع حجوزاتي أولاً.")
                }
                Button {
                    Task { await submit() }
                } label: {
                    HStack {
                        if sending { ProgressView().tint(.white) }
                        Text(sending ? "جارٍ إرسال الطلب…" : (submittedRequest == nil ? "إرسال طلب الحجز" : "إعادة إرسال نفس الطلب"))
                    }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(!canSubmit || sending)
                .opacity(canSubmit && !sending ? 1 : 0.5)
                .listRowBackground(Color.clear)
                Text("راح يظهر الطلب بحجوزاتي بانتظار مراجعة الإدارة، وإرساله وحده لا يحجز موعداً في Wix. إذا انقطع الاتصال، راجع حجوزاتي؛ إعادة المحاولة بنفس النموذج تستخدم نفس رقم الطلب لتجنب التكرار.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.canvas)
    }

    private func completion(_ booking: Booking) -> some View {
        ScrollView {
            VStack(spacing: 22) {
                Image(systemName: booking.status == "confirmed" ? "checkmark.circle.fill" : "clock.badge.checkmark")
                    .font(.system(size: 66)).foregroundStyle(Theme.forest)
                Text(booking.statusLabel).font(.title.bold())
                Text("\(booking.farmName)\n\(BaghdadDay.display(booking.date))")
                    .font(.title3).multilineTextAlignment(.center)
                NoticeView(message: completionMessage(booking))
                if let url = farm.officialBookingURL {
                    Button { openURL(url) } label: { Label("إكمال الحجز في Wix", systemImage: "arrow.up.right.square") }
                        .buttonStyle(PrimaryButtonStyle())
                }
                Text("رقم الطلب: \(booking.id)").font(.caption).textSelection(.enabled)
                Button("رجوع للمزرعة") { dismiss() }.buttonStyle(PrimaryButtonStyle())
            }
            .padding(24).padding(.top, 40)
        }
        .background(Theme.canvas)
    }

    private func completionMessage(_ booking: Booking) -> String {
        switch booking.status {
        case "confirmed": return "الإدارة أكدت هذا الحجز. تابع تفاصيله من حجوزاتي."
        case "pending": return "استلمت الخدمة طلب المراجعة. هذا الطلب وحده ما يحجز موعد Wix. أكمل الحجز الرسمي في Wix وتابع رد الإدارة من حجوزاتي."
        case "rejected": return "هذا الطلب لم توافق عليه الإدارة. راجع حجوزاتي لمعرفة الحالة الحالية."
        case "cancelled": return "هذا الطلب ملغي. راجع حجوزاتي قبل إرسال طلب آخر."
        default: return "وصل رد الخدمة. حدّث حجوزاتي لمتابعة حالة الطلب."
        }
    }

    @MainActor
    private func loadAvailability() async {
        loadingAvailability = true
        availabilityError = nil
        availabilityConfigured = false
        defer { loadingAvailability = false }
        do {
            let response = try await APIClient.shared.availability(farmID: farm.id)
            unavailable = Set(response.dates)
            availabilityConfigured = response.configured
            availabilityMessage = response.message ?? (response.advisory == true ? "التوفر إرشادي؛ الاختيار النهائي للوقت والحجز يتم عبر Wix." : nil)
            if submittedRequest == nil {
                firstAvailableDate = max(BaghdadDay.today, response.horizonStart.flatMap { BaghdadDay.date(from: $0) } ?? BaghdadDay.today)
                if let end = response.horizonEnd.flatMap({ BaghdadDay.date(from: $0) }) { lastAvailableDate = max(firstAvailableDate, end) }
                date = min(max(date, firstAvailableDate), max(firstAvailableDate, lastAvailableDate))
            }
        } catch { availabilityError = AppStore.message(for: error) }
    }

    @MainActor
    private func submit() async {
        guard canSubmit, !sending else { return }
        sending = true
        error = nil
        defer { sending = false }
        do {
            let payload = submittedRequest ?? BookingRequest(
                farmId: farm.id, date: dateString, guests: guests, customerName: trimmedName,
                phone: IraqiPhone.normalized(phone), notes: notes.trimmingCharacters(in: .whitespacesAndNewlines),
                requestId: requestID)
            submittedRequest = payload
            let result = try await APIClient.shared.requestBooking(payload)
            completedBooking = result.booking
            await store.refreshBookings()
        } catch {
            self.error = AppStore.message(for: error)
            if let apiError = error as? APIError {
                switch apiError {
                case .notConfigured, .identityUnavailable:
                    submittedRequest = nil
                case .server(_, let status, let code) where (400...499).contains(status) && status != 408 && status != 429 && code != "request_in_progress" && code != "booking_busy":
                    submittedRequest = nil
                    requestID = UUID().uuidString
                default: break
                }
            }
            await loadAvailability()
        }
    }
}
