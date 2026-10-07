import SwiftUI

@MainActor
struct SettingsView: View {
    @EnvironmentObject private var store: AppStore
    @State private var confirmsErasure = false
    @State private var erasing = false
    @State private var message: String?
    @State private var error: String?
    @State private var needsIdentityReset = false

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    Label("مزرعتي", systemImage: "leaf.fill").font(.title.bold()).foregroundStyle(Theme.forest)
                    Text("مزارع سياحية في العراق. اكتشف المكان، شوف التفاصيل، وارسل طلب حجز إلى الإدارة.")
                        .font(.subheadline).foregroundStyle(.secondary)
                }.padding(.vertical, 8)
            }
            Section("المعلومات") {
                NavigationLink("سياسة الخصوصية") { PrivacyView() }
                NavigationLink("الحجز والشروط") { BookingTermsView() }
                Link(destination: URL(string: "https://laithahmed1.wixstudio.com/mazr3ty")!) {
                    Label("الموقع الأصلي", systemImage: "safari")
                }
            }
            Section("تواصل مع إدارة مزرعتي") {
                Link(destination: URL(string: "tel:+9647708248458")!) {
                    Label("009647708248458", systemImage: "phone")
                        .environment(\.layoutDirection, .leftToRight)
                }
                Link(destination: URL(string: "mailto:laithlaith500@gmail.com")!) {
                    Label("laithlaith500@gmail.com", systemImage: "envelope")
                        .environment(\.layoutDirection, .leftToRight)
                }
            }
            Section("بيانات هذا الجهاز") {
                Text("طلبات الحجز مرتبطة بمفتاح خاص محفوظ بأمان على جهازك. لا توجد حسابات مستخدمين أو تسجيل دخول في هذه النسخة. انتقالك لجهاز آخر لا ينقل تاريخ الحجوزات تلقائياً.")
                    .font(.subheadline).foregroundStyle(.secondary)
                if let message { NoticeView(message: message) }
                if let error { NoticeView(message: error, isError: true) }
                if needsIdentityReset {
                    Button("إعادة تهيئة هوية الجهاز") { resetIdentity() }
                }
                Button(role: .destructive) { confirmsErasure = true } label: {
                    if erasing { ProgressView("جارٍ حذف البيانات…") }
                    else { Label("حذف بياناتي الشخصية", systemImage: "trash") }
                }.disabled(erasing)
            } footer: {
                Text("الحذف يحتاج اتصالاً بالخدمة. تُزال بيانات التواصل وربط الجهاز والمفضلة، وتبقى سجلات المواعيد المؤكدة. بيانات الحجز الرسمي في Wix تُدار عبر Wix أو الإدارة.")
            }
            Section {
                Text("الإصدار \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0")")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.canvas)
        .navigationTitle("المزيد")
        .confirmationDialog("حذف بياناتك الشخصية؟", isPresented: $confirmsErasure, titleVisibility: .visible) {
            Button("نعم، احذف بياناتي", role: .destructive) { Task { await erase() } }
            Button("رجوع", role: .cancel) {}
        } message: {
            Text("ستُزال معلوماتك وسجل طلبات الجهاز والمفضلة، وتستمر المواعيد المؤكدة محجوزة. لإلغاء موعد أو حذف بيانات الحجز الرسمي في Wix، تواصل مع الإدارة أو استخدم Wix أولاً.")
        }
    }

    @MainActor
    private func erase() async {
        erasing = true
        message = nil
        error = nil
        defer { erasing = false }
        do {
            try await store.eraseData()
            message = "تم حذف البيانات الشخصية وسجل الجهاز والمفضلة."
            needsIdentityReset = false
        } catch {
            if let apiError = error as? APIError, case .identityResetRequired = apiError {
                message = "حُذفت بياناتك من الخدمة وسجل الجهاز والمفضلة."
                needsIdentityReset = true
            }
            self.error = AppStore.message(for: error)
        }
    }

    @MainActor
    private func resetIdentity() {
        do {
            try store.completeIdentityReset()
            needsIdentityReset = false
            error = nil
            message = "تم حذف البيانات وإعادة تهيئة هوية الجهاز."
        } catch { self.error = AppStore.message(for: error) }
    }
}

@MainActor
struct PrivacyView: View {
    var body: some View {
        List {
            Section("بيانات الطلب") {
                Text("عند إرسال طلب مراجعة للحجز، يرسل التطبيق الاسم، رقم الهاتف، المزرعة، التاريخ، عدد الضيوف، والملاحظات التي تدخلها إلى خدمة مزرعتي وإدارة الحجز. إكمال الحجز الرسمي يفتح Wix خارج التطبيق، وتخضع بياناته لسياسة الموقع وWix. لا تدخل معلومات حساسة في الملاحظات.")
                Text("يُرسل مفتاح عشوائي خاص بهذا الجهاز لربط طلباتك ببعضها، ويُحفظ في Keychain. لا نطلب موقعك الحالي أو صورك أو جهات اتصالك.")
            }
            Section("على الجهاز") {
                Text("تُحفظ معرفات المزارع المفضلة محلياً. بيانات الحجز تُحمّل من الخدمة ولا تُحفظ كملفات محلية داخل التطبيق. نظام التشغيل قد يعرض آخر شاشة في مبدّل التطبيقات.")
            }
            Section("الخدمات الخارجية") {
                Text("صور المزارع تُحمّل من روابط الصور التي توفرها الإدارة، وقد يستقبل مزود الصورة عنوان الإنترنت الخاص باتصالك. خرائط Apple تُستخدم لعرض موقع المزرعة، وفتح الاتجاهات ينتقل إلى خدمة الخرائط.")
            }
            Section("الحذف") {
                Text("من المزيد ← حذف بياناتي الشخصية، تقدر تطلب إزالة معلومات التواصل وربط الجهاز وسجل طلبات المراجعة في مزرعتي. الطلبات غير المؤكدة تُحذف، وتبقى سجلات المواعيد المؤكدة دون الاسم والهاتف والملاحظات أو ربط الجهاز. الحجوزات الأصلية وسجلات جهات الاتصال التي تُنشأ مستقلاً في Wix لا تُحذف ولا تُلغى بهذا الخيار؛ تواصل مع الإدارة أو استخدم Wix للإلغاء وطلبات الخصوصية الخاصة بها. حذف التطبيق وحده لا يطلب حذف بياناتك من الخادم، ومفتاح Keychain قد يبقى بعد إعادة التثبيت.")
            }
            Section("السياسة الكاملة والتواصل") {
                if let url = AppConfiguration.privacyURL {
                    Link("افتح سياسة الخصوصية والتواصل مع الإدارة", destination: url)
                } else {
                    Text("تتوفر سياسة الخدمة الكاملة بعد إعداد عنوان الخادم. جهة التشغيل: مزرعتي.")
                }
                Link("الهاتف: 009647708248458", destination: URL(string: "tel:+9647708248458")!)
                Link("البريد: laithlaith500@gmail.com", destination: URL(string: "mailto:laithlaith500@gmail.com")!)
            }
        }
        .font(.body)
        .navigationTitle("الخصوصية")
        .navigationBarTitleDisplayMode(.inline)
    }
}

@MainActor
struct BookingTermsView: View {
    var body: some View {
        List {
            Section("كيف يتم الحجز؟") {
                Text("الطلب داخل مزرعتي يبدأ بانتظار مراجعة الإدارة، ولا يحجز موعد Wix وحده. زر إكمال الحجز في Wix يفتح صفحة المزرعة للحجز الرسمي والدفع. راجع حجوزاتي بالتحديث لمتابعة حالة طلب المراجعة.")
            }
            Section("السعر والتوفر") {
                Text("السعر والصور والخدمات تأتي من الموقع الأصلي، وقد تضيف الإدارة بيانات المزارع المكملة. التوفر النهائي والسعر والدفع تخضع لصفحة الحجز الأصلية في Wix. التطبيق لا يخصم مبالغ ولا يقدم بوابة دفع في هذه النسخة.")
            }
            Section("الإلغاء") {
                Text("خيار إلغاء الطلب يرسل الإلغاء إلى خدمة مزرعتي. لإلغاء الحجز الرسمي في Wix أو معالجة العربون والاسترداد، استخدم Wix أو تواصل مع الإدارة. الإلغاء داخل التطبيق لا ينفذ استرداداً مالياً.")
            }
            Section("تعليمات المزرعة") {
                Text("اقرأ وصف المزرعة قبل الطلب وتحقق مع الإدارة من ساعات الوصول والمغادرة وتعليمات الاستخدام. لا تتجاوز السعة المنشورة.")
            }
        }
        .navigationTitle("الحجز والشروط")
        .navigationBarTitleDisplayMode(.inline)
    }
}
