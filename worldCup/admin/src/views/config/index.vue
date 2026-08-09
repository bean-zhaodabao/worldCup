<template>
  <div class="config-page">
    <h2>系统配置</h2>
    <el-card style="max-width:600px">
      <el-form :model="form" label-width="160px" v-loading="loading">
        <el-form-item label="单注最低金额 (¥)"><el-input-number v-model="form.minBet" :min="0" :precision="2" :step="10" style="width:200px" /></el-form-item>
        <el-form-item label="单注最高金额 (¥)"><el-input-number v-model="form.maxBet" :min="0" :precision="2" :step="100" style="width:200px" /></el-form-item>
        <el-form-item><el-button type="primary" @click="doSave" :loading="saving">保存配置</el-button></el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getSystemConfig, updateSystemConfig } from '@/api'

const loading=ref(false),saving=ref(false)
const form=reactive({minBet:2.00,maxBet:100000.00})

onMounted(async()=>{loading.value=true;try{const res=await getSystemConfig();const d=res.data;if(d.minBet)form.minBet=parseFloat(d.minBet);if(d.maxBet)form.maxBet=parseFloat(d.maxBet)}catch(e){console.error(e)}loading.value=false})

const doSave=async()=>{saving.value=true;try{await updateSystemConfig({...form});ElMessage.success('配置已保存')}catch(e){ElMessage.error(e.message||'保存失败')};saving.value=false}
</script>

<style lang="scss" scoped>
.config-page h2 { margin-bottom: 16px; }
</style>
