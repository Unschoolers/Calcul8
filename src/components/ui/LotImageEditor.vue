<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import { compressSinglesImageFile, SinglesImageUploadError } from "../windows/singles/singlesImageUpload.ts";
const props = defineProps<{ modelValue: string; disabled?: boolean; t: (key: string) => string }>();
const emit = defineEmits<{ (event: "update:modelValue", value: string): void; (event: "busy", value: boolean): void }>();
const picker = ref<HTMLInputElement | null>(null);
const busy = ref(false), error = ref("");
let revision = 0;
onBeforeUnmount(() => { revision++; emit("busy", false); });
async function upload(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0]; input.value = "";
  if (!file || props.disabled || busy.value) return;
  const current = ++revision; busy.value = true; emit("busy", true); error.value = "";
  try {
    const image = await compressSinglesImageFile(file);
    if (current === revision) emit("update:modelValue", image);
  } catch (failure) {
    if (current === revision) error.value = props.t(failure instanceof SinglesImageUploadError && failure.code === "invalid_type" ? "lotImageInvalidType" : failure instanceof SinglesImageUploadError && failure.code === "too_large" ? "lotImageTooLarge" : "lotImageReadError");
  } finally {
    if (current === revision) { busy.value = false; emit("busy", false); }
  }
}
function remove(): void { error.value = ""; emit("update:modelValue", ""); }
</script>

<template>
  <section class="lot-image-editor" :aria-label="t('lotImageLabel')">
    <input ref="picker" type="file" accept="image/*" class="lot-image-editor__input" :aria-label="t('lotImageLabel')" :disabled="disabled || busy" @change="upload" />
    <div class="lot-image-editor__preview" aria-hidden="true">
      <img v-if="modelValue" :src="modelValue" alt="" />
      <v-icon v-else size="28" color="secondary">mdi-image-plus-outline</v-icon>
    </div>
    <div class="lot-image-editor__content">
      <div class="text-body-2 font-weight-medium">{{ t('lotImageLabel') }}</div>
      <div class="text-caption text-medium-emphasis">{{ t('lotImageHint') }}</div>
      <div class="lot-image-editor__actions">
        <v-btn size="small" variant="tonal" color="secondary" class="app-touch-target" :disabled="disabled || busy" :loading="busy" @click="picker?.click()">{{ t(modelValue ? 'lotImageReplace' : 'lotImageAdd') }}</v-btn>
        <v-btn v-if="modelValue" size="small" variant="text" class="app-touch-target" :disabled="disabled || busy" @click="remove">{{ t('lotImageRemove') }}</v-btn>
      </div>
    </div>
    <div v-if="error" role="alert" class="lot-image-editor__error text-caption text-error">{{ error }}</div>
  </section>
</template>

<style scoped>
.lot-image-editor { display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 12px; align-items: center; padding: 12px; border-radius: 12px; border: 1px solid rgba(var(--v-theme-on-surface), .12); background: rgba(var(--v-theme-secondary), .04); }
.lot-image-editor__input { display: none; }
.lot-image-editor__preview { width: 72px; height: 80px; display: flex; align-items: center; justify-content: center; border-radius: 8px; background: rgb(var(--v-theme-surface)); overflow: hidden; }
.lot-image-editor__preview img { width: 100%; height: 100%; object-fit: contain; }
.lot-image-editor__content { min-width: 0; }
.lot-image-editor__actions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
.lot-image-editor__error { grid-column: 1 / -1; }
</style>
