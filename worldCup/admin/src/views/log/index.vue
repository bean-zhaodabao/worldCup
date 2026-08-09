<template>
  <div class="log-page">
    <h2>操作日志</h2>
    <el-card style="margin-bottom:16px">
      <el-form :inline="true">
        <el-form-item label="操作类型"><el-select v-model="qf.action" placeholder="全部" clearable style="width:150px"><el-option label="中奖设定" value="set_win"/><el-option label="赔率修改" value="update_odds"/><el-option label="赛事状态" value="match_status"/><el-option label="用户创建" value="create_user"/><el-option label="玩法更新" value="update_play"/><el-option label="赛事结算" value="settle_match"/><el-option label="复制玩法" value="copy_plays"/><el-option label="配置更新" value="update_config"/></el-select></el-form-item>
        <el-form-item label="时间范围"><el-date-picker v-model="dateRange" type="daterange" range-separator="至" /></el-form-item>
        <el-form-item><el-button type="primary" icon="Search" @click="loadList">搜索</el-button></el-form-item>
      </el-form>
    </el-card>
    <el-card>
      <el-table :data="list" border stripe v-loading="loading">
        <el-table-column prop="adminName" label="操作人" width="120" />
        <el-table-column label="操作类型" width="130"><template #default="{row}"><el-tag>{{ actionMap[row.action] }}</el-tag></template></el-table-column>
        <el-table-column prop="detail" label="详情" min-width="300" />
        <el-table-column label="操作时间" width="180"><template #default="{row}">{{ fmt(row.createTime) }}</template></el-table-column>
      </el-table>
      <el-pagination v-model:current-page="page" v-model:page-size="ps" :total="total" layout="total,prev,pager,next" style="margin-top:16px;justify-content:flex-end" @change="loadList" />
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { getLogList } from '@/api'

const loading=ref(false),list=ref([]),page=ref(1),ps=ref(30),total=ref(0)
const qf=reactive({action:''}),dateRange=ref([])

const actionMap={set_win:'中奖设定',update_odds:'赔率修改',match_status:'赛事状态',create_user:'用户创建',update_play:'玩法更新',settle_match:'赛事结算',copy_plays:'复制玩法',update_config:'配置更新'}

const loadList=async()=>{loading.value=true;try{const res=await getLogList({...qf,page:page.value,pageSize:ps.value,startDate:dateRange.value?.[0],endDate:dateRange.value?.[1]});list.value=res.data.list||[];total.value=res.data.total||0}catch(e){console.error(e)}loading.value=false}
loadList()
const fmt=(t)=>t?new Date(t).toLocaleString('zh-CN'):''
</script>

<style lang="scss" scoped>
.log-page h2 { margin-bottom: 16px; }
</style>
