<script lang="ts">
import { defineComponent as defineVueComponent } from "vue";
import { appOptions } from "./app.ts";
import type { Lot } from "./types/app.ts";

export default defineVueComponent(appOptions);
</script>

<template src="./App.html"></template>
